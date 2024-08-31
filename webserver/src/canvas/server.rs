//! A multi-room chat server.

use actix::Recipient;
use std::{
    collections::{HashMap, HashSet},
    io,
    sync::Arc,
};
use tokio::sync::{
    mpsc::{self},
    oneshot,
};

use super::{
    events::CanvasEvents,
    store::{Canvas, CanvasId, CanvasState, GetCanvasMessage},
};
use crate::{
    canvas::store::AccessLevel,
    persistence::{EventLogPersistenceJson, EventLogPersistenceStandaloneJson},
    userstore::UserId,
};

pub type Msg = String;

#[derive(Debug)]
enum Command {
    Connect {
        user_id: UserId,
        username: String,
        canvas_id: CanvasId,
        session_id: WSSessionId,
        conn_tx: mpsc::UnboundedSender<Msg>,
    },

    Disconnect {
        user_id: UserId,
        session_id: WSSessionId,
        canvas_id: CanvasId,
    },

    HandleMessage {
        msg: String,
        canvas_id: CanvasId,
        user_id: UserId,
        session_id: WSSessionId,
        res_tx: oneshot::Sender<()>,
    },

    UpdateUserAccessLevel {
        user_id: UserId,
        canvas_id: CanvasId,
        access_level: AccessLevel,
    },

    UpdateCanvasState {
        canvas_id: CanvasId,
        initiator_id: UserId,
        state: CanvasState,
    },
}

type WSSessionId = String;

struct CanvasInstance {
    users: HashMap<UserId, HashMap<WSSessionId, mpsc::UnboundedSender<Msg>>>,
    selected_shapes: HashMap<WSSessionId, HashSet<String>>,

    persistence: EventLogPersistenceStandaloneJson<CanvasEvents>,
    event_log: Vec<CanvasEvents>,

    inner: Canvas,

    /// tracks temporary shapes that should not be persisted
    temp_shapes: HashSet<String>,
}

pub struct CanvasSocketServer {
    canvases: HashMap<CanvasId, CanvasInstance>,

    get_canvas_recipient: Arc<Recipient<GetCanvasMessage>>,

    /// Command receiver.
    cmd_rx: mpsc::UnboundedReceiver<Command>,
}

impl CanvasSocketServer {
    pub fn new(
        get_canvas_recipient: Arc<Recipient<GetCanvasMessage>>,
    ) -> (Self, CanvasSocketServerHandle) {
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();

        (
            Self {
                canvases: HashMap::new(),
                get_canvas_recipient,
                cmd_rx,
            },
            CanvasSocketServerHandle { cmd_tx },
        )
    }

    fn persist_event(canvas: &mut CanvasInstance, event: &CanvasEvents) {
        // do not persist temporary shapes
        let should_persist = match &event {
            CanvasEvents::ShapeAdded { shape, .. } => {
                if shape.is_temporary() {
                    canvas.temp_shapes.insert(shape.get_id().to_string());
                    false
                } else {
                    true
                }
            }

            CanvasEvents::ShapeRemoved { shapeId, .. } => {
                !canvas.temp_shapes.remove(shapeId) // don't persist if shape was temporary
            }

            _ => true,
        };

        if should_persist {
            canvas.persistence.save_event(event).unwrap();
        }
    }

    fn broadcast_event(
        canvas: &mut CanvasInstance,
        skip_session: Option<WSSessionId>,
        event: impl Into<CanvasEvents>,
    ) {
        let event = event.into();

        let message: Result<Msg, serde_json::Error> = (&event).try_into();
        match message {
            Ok(message) => {
                let skip_session_id = skip_session.unwrap_or_default(); // there will never be a user with empty id
                canvas
                    .users
                    .iter()
                    .flat_map(|(_, sockets)| sockets.iter() )
                    .for_each(move | (session_id, tx)| {
                        if session_id == &skip_session_id {
                            return;
                        }
                        // don't care if we can't send
                        // heartbeat will disconnect user
                        let _ = tx.send(message.clone());
                    });
            }

            Err(e) => {
                println!("Failed to serialize event: {e}");
                return;
            }
        }

        canvas.event_log.push(event);
    }

    fn send_initial_state(canvas: &CanvasInstance, user_id: UserId) {
        if let Some(sockets) = canvas.users.get(&user_id) {
            for event in &canvas.event_log {
                let event: String = event.try_into().expect("Event can't be serialized"); // This is a application error, so we can panic
                for (_, tx) in sockets.iter() {
                    let _ = tx.send(event.clone());
                }
            }
        }
    }

    async fn connect(
        &mut self,
        tx: mpsc::UnboundedSender<Msg>,
        canvas_id: CanvasId,
        user_id: UserId,
        username: String,
        session_id: WSSessionId,
    ) {
        println!("{username}({user_id}-{session_id}) joined canvas {canvas_id}");

        if !self.canvases.contains_key(&canvas_id) {
            if let Err(e) = self.load_canvas(&canvas_id).await {
                println!("Failed to load events: {e}");
                tx.send("Connection failed".to_string()).unwrap();
                return;
            }
        }

        if let Some(canvas) = self.canvases.get_mut(&canvas_id) {
            canvas
                .users
                .entry(user_id.clone())
                .and_modify(|sessions| {
                    sessions.insert(session_id.clone(), tx.clone());
                })
                .or_insert_with(|| {
                    let mut user_sessions = HashMap::with_capacity(1);
                    user_sessions.insert(session_id.clone(), tx.clone());
                    user_sessions
                });

            let event = CanvasEvents::UserJoined {
                userId: user_id.clone(),
                username,
                sessionId: session_id.clone(),
                timestamp: chrono::Utc::now().timestamp() as u64,
                accessLevel: AccessLevel::Owner,
            };

            Self::persist_event(canvas, &event);
            Self::broadcast_event(canvas, Some(session_id), event); // does not contain own join
            Self::send_initial_state(canvas, user_id); // does contain own join
        }
    }

    async fn load_canvas(&mut self, canvas_id: &str) -> Result<(), String> {
        let persistence = EventLogPersistenceJson::new(format!("./{}.jsonl", canvas_id).as_str())
            .map_err(|e| e.to_string())?;
        let (event_log, persistence) = persistence
            .into_standalone::<CanvasEvents>()
            .map_err(|e| e.to_string())?;

        let canvas = self
            .get_canvas_recipient
            .send(GetCanvasMessage {
                canvas_id: canvas_id.to_string(),
            })
            .await
            .map_err(|e| e.to_string())?
            .map(Ok)
            .unwrap_or(Err("Canvas not found".to_string()))?;

        self.canvases.insert(
            canvas_id.to_string(),
            CanvasInstance {
                selected_shapes: HashMap::new(),
                temp_shapes: HashSet::new(),
                inner: canvas,
                users: HashMap::with_capacity(1),
                event_log,
                persistence,
            },
        );

        Ok(())
    }

    fn unselect_selected_shapes(canvas: &mut CanvasInstance, session_id: &WSSessionId) {
        let mut events = Vec::new();
        if let Some(selected_shapes) = canvas.selected_shapes.get_mut(session_id) {
            for shape_id in selected_shapes.drain() {
                events.push(CanvasEvents::ShapeDeselected {
                    origin: session_id.clone(),
                    shapeId: shape_id,
                    timestamp: chrono::Utc::now().timestamp() as u64,
                });
            }
        }

        for event in events {
            Self::persist_event(canvas, &event);
            Self::broadcast_event(canvas, Some(session_id.clone()), event);
        }
    }

    fn disconnect(&mut self, canvas_id: CanvasId, user_id: UserId, session_id: WSSessionId) {
        println!("{user_id}-{session_id} disconnected from {canvas_id}");

        if let Some(users_left) = self.canvases.get_mut(&canvas_id).map(| canvas | {
            Self::unselect_selected_shapes(canvas, &session_id);

            // delete user and session
            if let Some(session_count) = canvas.users.get_mut(&user_id).map(| sessions | {
                sessions.remove(&session_id);
                sessions.len()
            }) {
                if session_count == 0 {
                    canvas.users.remove(&user_id);
                }
            }
            
            let event = CanvasEvents::UserLeft {
                userId: user_id.clone(),
                sessionId: session_id.clone(),
                timestamp: chrono::Utc::now().timestamp() as u64, // timestamp will never be before 1970
            };

            Self::persist_event(canvas, &event);
            Self::broadcast_event(canvas, Some(session_id), event);

            canvas.users.len()
        }) {
            if users_left == 0 {
                println!("No users left in {canvas_id}, unloading canvas");
                self.canvases.remove(&canvas_id);
            }
        }
    }

    fn update_user_access_level(
        &mut self,
        canvas_id: CanvasId,
        user_id: UserId,
        access_level: AccessLevel,
    ) {
        if let Some(canvas) = self.canvases.get_mut(&canvas_id) {
            let event = CanvasEvents::UserAccessLevelChanged {
                userId: user_id.clone(),
                accessLevel: access_level.clone(),
                timestamp: chrono::Utc::now().timestamp() as u64,
            };

            canvas
                .inner
                .users
                .entry(user_id)
                .and_modify(|e| *e = access_level.clone())
                .or_insert(access_level);

            Self::persist_event(canvas, &event);
            Self::broadcast_event(canvas, None, event);
        }
    }

    fn update_canvas_state(&mut self, canvas_id: CanvasId, state: CanvasState, initiator_id: UserId) {
        if let Some(canvas) = self.canvases.get_mut(&canvas_id) {
            canvas.inner.state = state.clone();

            let event = CanvasEvents::CanvasStateChanged {
                state,
                timestamp: chrono::Utc::now().timestamp() as u64,
                initiatorId: initiator_id,
            };

            Self::persist_event(canvas, &event);
            Self::broadcast_event(canvas, None, event);
        }
    }

    ///
    /// Updates event log and stores event
    /// Keeps track of selected shapes
    /// 
    fn track_selected_shapes(canvas: &mut CanvasInstance, session_id: &WSSessionId, event: &CanvasEvents) {
        // store selected shapes
        match event {
            CanvasEvents::ShapeSelected { shapeId, .. } => {
                canvas
                    .selected_shapes
                    .entry(session_id.clone())
                    .or_default()
                    .insert(shapeId.clone());
            }

            CanvasEvents::ShapeDeselected { shapeId, .. } => {
                canvas
                    .selected_shapes
                    .entry(session_id.clone())
                    .or_default()// should never be reached
                    .remove(shapeId);
            }

            _ => ()
        }
    }

    /// check if event is a system event
    /// system events will only be send by the server
    fn message_allowed(event: &CanvasEvents) -> bool {
        !matches!(event,
            CanvasEvents::UserJoined { .. } | 
            CanvasEvents::UserLeft { .. } | 
            CanvasEvents::UserAccessLevelChanged { .. } | 
            CanvasEvents::CanvasStateChanged { .. }
        )
    }

    fn validate_permissions(canvas: &CanvasInstance, user_id: &UserId) -> bool {
        canvas.inner.users.get(user_id).map_or(false, | access_level | {
            match (access_level, &canvas.inner.state) {
                (AccessLevel::Owner, _) => true,
                (AccessLevel::Moderate, _) => true,
                (AccessLevel::Voice, _) => true,
                (AccessLevel::Write, CanvasState::Active) => true,  // Write only in active state
                (_, _) => false,                                    // anything else can't write
            }
        })
    }

    fn handle_message(&mut self, canvas_id: CanvasId, user_id: UserId, session_id: WSSessionId, event: CanvasEvents) {
        if Self::message_allowed(&event) {
            if let Some(canvas) = self.canvases.get_mut(&canvas_id) {
                if Self::validate_permissions(canvas, &user_id) {
                    Self::track_selected_shapes(canvas, &session_id, &event);                        
                    Self::persist_event(canvas, &event);
                    Self::broadcast_event(canvas, Some(session_id), event);
                }
            }
        } else {
            println!("User {user_id} tried to send system message");
        }
    }

    pub async fn run(mut self) -> io::Result<()> {
        while let Some(cmd) = self.cmd_rx.recv().await {
            match cmd {
                Command::Connect {
                    conn_tx,
                    canvas_id,
                    user_id,
                    username,
                    session_id,
                } => {
                    self.connect(conn_tx, canvas_id, user_id, username, session_id)
                        .await;
                }

                Command::Disconnect {
                    canvas_id,
                    user_id,
                    session_id,
                } => {
                    self.disconnect(canvas_id, user_id, session_id);
                }

                Command::UpdateUserAccessLevel {
                    user_id,
                    canvas_id,
                    access_level,
                } => {
                    self.update_user_access_level(canvas_id, user_id, access_level);
                }

                Command::UpdateCanvasState { canvas_id, state, initiator_id } => {
                    self.update_canvas_state(canvas_id, state, initiator_id);
                }

                Command::HandleMessage {
                    canvas_id,
                    user_id,
                    session_id,
                    msg,
                    res_tx,
                } => {
                    if let Ok(event) = serde_json::from_str::<CanvasEvents>(&msg) {
                        self.handle_message(canvas_id, user_id, session_id, event)
                    } else {
                        println!(
                            "Failed to deserialize message from {user_id} in {canvas_id}: {msg}"
                        );
                    }
                    let _ = res_tx.send(()); // notify sender that message was handeled
                }
            }
        }

        Ok(())
    }
}

/// Reduces boilerplate of setting up response channels in WebSocket handlers.
#[derive(Debug, Clone)]
pub struct CanvasSocketServerHandle {
    cmd_tx: mpsc::UnboundedSender<Command>,
}

impl CanvasSocketServerHandle {
    /// Register client message sender and obtain connection ID.
    pub async fn connect(
        &self,
        conn_tx: mpsc::UnboundedSender<Msg>,
        canvas_id: CanvasId,
        user_id: UserId,
        username: String,
        session_id: WSSessionId,
    ) {
        // unwrap: chat server should not have been dropped
        self.cmd_tx
            .send(Command::Connect {
                conn_tx,
                canvas_id,
                user_id,
                username,
                session_id,
            })
            .unwrap();
    }

    pub fn update_canvas_state(&self, canvas_id: CanvasId, state: CanvasState, initiator_id: UserId) {
        // unwrap: chat server should not have been dropped
        self.cmd_tx
            .send(Command::UpdateCanvasState { canvas_id, state, initiator_id })
            .unwrap();
    }

    pub fn update_user_permissions(
        &self,
        canvas_id: CanvasId,
        user_id: UserId,
        access_level: AccessLevel,
    ) {
        // unwrap: chat server should not have been dropped
        self.cmd_tx
            .send(Command::UpdateUserAccessLevel {
                canvas_id,
                user_id,
                access_level,
            })
            .unwrap();
    }

    /// Broadcast message to current room.
    pub async fn broadcast_event(&self, canvas_id: CanvasId, user_id: UserId, session_id: WSSessionId, msg: impl Into<Msg>) {
        let (res_tx, res_rx) = oneshot::channel();

        // unwrap: chat server should not have been dropped
        self.cmd_tx
            .send(Command::HandleMessage {
                msg: msg.into(),
                canvas_id,
                user_id,
                session_id,
                res_tx,
            })
            .unwrap();

        // unwrap: chat server does not drop our response channel
        res_rx.await.unwrap();
    }

    /// Unregister message sender and broadcast disconnection message to current room.
    pub fn disconnect(&self, canvas_id: CanvasId, user_id: UserId, session_id: WSSessionId) {
        // unwrap: chat server should not have been dropped
        self.cmd_tx
            .send(Command::Disconnect {
                canvas_id,
                user_id,
                session_id,
            })
            .unwrap();
    }
}
