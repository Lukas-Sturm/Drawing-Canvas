use std::{
    pin::pin,
    time::{Duration, Instant},
};
use actix_ws::AggregatedMessage;
use futures_util::{
    future::{select, Either},
    StreamExt as _,
};
use tokio::{sync::mpsc, time::interval};
use crate::{authentication::JWTUser, canvas::server::CanvasSocketServerHandle};
use super::store::CanvasId;

/// This is the main loop for each WebSocket connection.
/// It communicates with the main WebsocketCanvasServer using channels.
/// This is heavily inspired by the actix-websocket chat example.
/// Uses ping/pong mechanism to detect broken or dangling connections.
/// Also handles the initial registration of the session.

/// How often heartbeat pings are sent
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);

/// How long before lack of client response causes a timeout
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
struct RegisterSession {
    session: String,
}

/// Echo text & binary messages received from the client, respond to ping messages, and monitor
/// connection health to detect network issues and free up resources.
pub async fn start_canvas_websocket_connection(
    chat_server: CanvasSocketServerHandle,
    mut session: actix_ws::Session,
    msg_stream: actix_ws::MessageStream,
    canvas_id: CanvasId,
    user: JWTUser,
) {
    let mut last_heartbeat = Instant::now();
    let mut interval = interval(HEARTBEAT_INTERVAL);

    let (message_tx, mut message_rx) = mpsc::unbounded_channel();
    let mut client_session_id: Option<String> = None;

    let msg_stream = msg_stream
        .max_frame_size(128 * 1024)
        .aggregate_continuations()
        .max_continuation_size(2 * 1024 * 1024);

    let mut msg_stream = pin!(msg_stream);

    let close_reason = loop {
        // most of the futures we process need to be stack-pinned to work with select()
        let tick = pin!(interval.tick());
        let msg_rx = pin!(message_rx.recv());

        // TODO: nested select is pretty gross for readability on the match
        let messages = pin!(select(msg_stream.next(), msg_rx));

        match select(messages, tick).await {
            // commands & messages received from client
            Either::Left((Either::Left((Some(Ok(msg)), _)), _)) => match msg {
                AggregatedMessage::Ping(bytes) => {
                    last_heartbeat = Instant::now();
                    session.pong(&bytes).await.unwrap();
                }

                AggregatedMessage::Pong(_) => {
                    last_heartbeat = Instant::now();
                }

                AggregatedMessage::Text(text) => {
                    if let Some(client_session_id) = &client_session_id {
                        // println!("Received message: {user} in {canvas_id}: {msg}");
                        let msg = text.trim();
                        chat_server
                            .broadcast_event(
                                canvas_id.clone(),
                                user.id.clone(),
                                client_session_id.clone(),
                                msg,
                            )
                            .await;
                    } else {
                        let message = serde_json::from_str::<RegisterSession>(&text);
                        client_session_id =
                            message.map(|message| Some(message.session)).unwrap_or(None);
                        if let Some(origin) = &client_session_id {
                            chat_server
                                .connect(
                                    message_tx.clone(),
                                    canvas_id.clone(),
                                    user.id.clone(),
                                    user.username.clone(),
                                    origin.clone(),
                                )
                                .await;
                        } else {
                            println!("Invalid session message received {text}");
                            break None;
                        }
                    }
                }

                AggregatedMessage::Binary(_bin) => {
                    println!("unexpected binary message");
                }

                AggregatedMessage::Close(reason) => break reason,
            },

            // client WebSocket stream error
            Either::Left((Either::Left((Some(Err(err)), _)), _)) => {
                println!("{}", err);
                break None;
            }

            // client WebSocket stream ended
            Either::Left((Either::Left((None, _)), _)) => break None,

            // chat messages received from other room participants
            Either::Left((Either::Right((Some(chat_msg), _)), _)) => {
                session.text(chat_msg).await.unwrap();
            }

            // all connection's message senders were dropped
            Either::Left((Either::Right((None, _)), _)) => unreachable!(
                "all connection message senders were dropped; chat server may have panicked"
            ),

            // heartbeat internal tick
            Either::Right((_inst, _)) => {
                // if no heartbeat ping/pong received recently, close the connection
                if Instant::now().duration_since(last_heartbeat) > CLIENT_TIMEOUT {
                    println!("User {} in {canvas_id} timed out", user.id);
                    break None;
                }

                // send heartbeat ping
                let _ = session.ping(b"").await;
            }
        };
    };

    if let Some(session_id) = client_session_id {
        chat_server.disconnect(canvas_id, user.id.clone(), session_id);
    }

    // attempt to close connection gracefully
    let _ = session.close(close_reason).await;
}
