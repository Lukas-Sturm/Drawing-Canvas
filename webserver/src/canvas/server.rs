//! A multi-room chat server.

use std::{collections::{HashMap, HashSet}, io, sync::Arc};
use actix::Recipient;
use actix_web::web;
use tokio::sync::{mpsc::{self, UnboundedSender}, oneshot};

use crate::{authentication::JWTUser, canvas::store::AccessLevel, persistence::{EventLogPersistenceJson, EventLogPersistenceStandaloneJson}, userstore::UserId};
use super::{events::CanvasEvents, store::{Canvas, CanvasId, CanvasState, GetCanvasMessage}};

pub type Msg = String;

#[derive(Debug)]
enum Command {
    Connect {
        user_id: UserId,
        username: String,
        canvas_id: CanvasId,
        conn_tx: mpsc::UnboundedSender<Msg>,
    },

    Disconnect {
        user_id: UserId,
        canvas_id: CanvasId,
    },

    HandleMessage {
        msg: String,
        canvas_id: CanvasId,
        user_id: UserId,
        res_tx: oneshot::Sender<()>,
    },

    UpdateUserAccessLevel {
        user_id: UserId,
        canvas_id: CanvasId,
        access_level: AccessLevel,
    },

    UpdateCanvasState {
        canvas_id: CanvasId,
        state: CanvasState,
    }
}

impl TryInto<Msg> for &CanvasEvents {
    type Error = serde_json::Error;

    fn try_into(self) -> Result<Msg, Self::Error> {
        serde_json::to_string(self)
    }
}


struct CanvasInstance {
    users: HashMap<UserId, mpsc::UnboundedSender<Msg>>,

    persistence: EventLogPersistenceStandaloneJson<CanvasEvents>,
    event_log: Vec<CanvasEvents>,

    inner: Canvas,
    
    /// tracks temporary shapes that should not be persisted
    temp_shapes: HashSet<String>
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

    fn broadcast_event(&mut self, canvas_id: CanvasId, user_id: Option<UserId>, event: impl Into<CanvasEvents>) {
        if let Some(canvas) = self.canvases.get_mut(&canvas_id) {
            let event = event.into();

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
                    if canvas.temp_shapes.remove(shapeId) {
                        false
                    } else {
                        true
                    }
                }

                _ => { true }
            };

            if should_persist {
                canvas.persistence.save_event(&event).unwrap();
            }
            
            let message: Result<Msg, serde_json::Error> = (&event).try_into();
            match message {
                Ok(message) => {
                    let user_id = user_id.unwrap_or_default(); // there will never be a user with empty id
                    canvas.users.iter()
                        .filter(| (u, _) | !(*u == user_id.as_str()))
                        .for_each(move | (_, tx) | {
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
        } else {
            println!("No canvas found for {canvas_id} when broadcasting event");
        }    
    }

    fn send_initial_state(&mut self, canvas_id: CanvasId, user_id: UserId) {
        // TODO: do not send access level and join leave, 
        if let Some(canvas) = self.canvases.get(&canvas_id) {
            if let Some(tx) = canvas.users.get(&user_id) {
                let result: Result<(), serde_json::Error> = canvas.event_log
                    .iter()
                    .map(TryInto::try_into)
                    .try_for_each(| event | {
                        let _ = tx.send(event?);
                        Ok(())
                    });
                
                if let Err(e) = result {
                    let _ = tx.send("Failed to send initial state".to_string());
                    println!("Failed to send initial state: {e}");
                }
            }
        } else {
            println!("No canvas found for {canvas_id} when broadcasting event");
        }    
    }

    async fn connect(&mut self, tx: mpsc::UnboundedSender<Msg>, canvas_id: CanvasId, user_id: UserId, username: String) {
        if !self.canvases.contains_key(&canvas_id) {
            println!("{username}({user_id}) joined unloaded canvas {canvas_id}");

            if let Err(e) = self.load_canvas(&canvas_id, &user_id, &tx).await {
                println!("Failed to load events: {e}");
                tx.send("Connection failed".to_string()).unwrap();
                return;
            }
        } else {
            println!("{username}({user_id}) joined loaded canvas {canvas_id}");
            if let Some(canvas) = self.canvases.get_mut(&canvas_id) {
                canvas.users.insert(user_id.to_string(), tx.clone());
            }
        }

        let event = CanvasEvents::UserJoined {
            userId: user_id.clone(),
            username,
            timestamp: chrono::Utc::now().timestamp() as u64,
            accessLevel: AccessLevel::Owner,
        };
        self.broadcast_event(canvas_id.clone(), Some(user_id.clone()), event);
        self.send_initial_state(canvas_id, user_id);
    }

    async fn load_canvas(&mut self, canvas_id: &str, user_id: &str, tx: &UnboundedSender<String>) -> Result<(), String> {
        let persistence = EventLogPersistenceJson::new(format!("./{}.jsonl", canvas_id).as_str())
            .map_err(|e| e.to_string())?;
        let (event_log, persistence) = persistence.to_standalone::<CanvasEvents>()
            .map_err(|e| e.to_string())?;

        let mut users = HashMap::with_capacity(1);
        users.insert(user_id.to_string(), tx.clone());

        let canvas = self.get_canvas_recipient.send(GetCanvasMessage { canvas_id: canvas_id.to_string() })
            .await
            .map_err(|e| e.to_string())?
            .map(|canvas| Ok(canvas))
            .unwrap_or(Err("Canvas not found".to_string()))?;

        self.canvases.insert(canvas_id.to_string(), CanvasInstance {
            temp_shapes: HashSet::new(),
            inner: canvas,
            users,
            event_log,
            persistence,
        });

        Ok(())
    }

    fn disconnect(&mut self, canvas_id: CanvasId, user_id: UserId) {
        // TODO: unselect shapes
        println!("{user_id} disconnected from {canvas_id}");

        if !self.canvases.contains_key(&canvas_id) {
            return;
        }

        let len = if let Some(canvas) = self.canvases.get_mut(&canvas_id) {
            canvas.users.remove(&user_id);
            canvas.users.len()
        } else {
            0
        };

        // broadcast user left event
        // even if no user is left, we still want to persist this event
        let event = CanvasEvents::UserLeft {
            userId: user_id.clone(),
            timestamp: chrono::Utc::now().timestamp() as u64, // timestamp will never be before 1970
        };
        self.broadcast_event(canvas_id.clone(), Some(user_id), event);

        if len == 0 {
            println!("No users left in {canvas_id}, unloading canvas");
            self.canvases.remove(&canvas_id);
        }
    }

    fn update_user_access_level(&mut self, canvas_id: CanvasId, user_id: UserId, access_level: AccessLevel) {
        if let Some(canvas) = self.canvases.get_mut(&canvas_id) {
            let event = CanvasEvents::UserAccessLevelChanged {
                userId: user_id.clone(),
                accessLevel: access_level.clone(),
                timestamp: chrono::Utc::now().timestamp() as u64,
            };
            
            canvas.inner.users.entry(user_id)
                .and_modify(|e| *e = access_level.clone())
                .or_insert(access_level);
        
            self.broadcast_event(canvas_id, None, event);
        }
    }

    fn update_canvas_state(&mut self, canvas_id: CanvasId, state: CanvasState) {
        if let Some(canvas) = self.canvases.get_mut(&canvas_id) {
            canvas.inner.state = state;
        }
    }

    pub async fn run(mut self) -> io::Result<()> {
        while let Some(cmd) = self.cmd_rx.recv().await {
            match cmd {
                Command::Connect { conn_tx, canvas_id, user_id, username } => {
                    self.connect(conn_tx, canvas_id, user_id, username).await;
                }

                Command::Disconnect { canvas_id, user_id } => {
                    self.disconnect(canvas_id, user_id);
                }

                Command::UpdateUserAccessLevel { user_id, canvas_id, access_level } => {
                    self.update_user_access_level(canvas_id, user_id, access_level);
                }

                Command::UpdateCanvasState { canvas_id, state } => {
                    self.update_canvas_state(canvas_id, state);
                }

                Command::HandleMessage { canvas_id, user_id, msg, res_tx } => {
                    
                    // TODO: add access rights here

                    if let Ok(event) = serde_json::from_str::<CanvasEvents>(&msg) {
                        self.broadcast_event(canvas_id, Some(user_id), event);
                    } else {
                        println!("Failed to deserialize message from {user_id} in {canvas_id}: {msg}");
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
    pub async fn connect(&self, conn_tx: mpsc::UnboundedSender<Msg>, canvas_id: CanvasId, user_id: UserId, username: String, access_level: AccessLevel) {
        // unwrap: chat server should not have been dropped
        self.cmd_tx
            .send(Command::Connect { conn_tx, canvas_id, user_id, username })
            .unwrap();
    }

    pub fn update_user_permissions(&self, canvas_id: CanvasId, user_id: UserId, access_level: AccessLevel) {
        // unwrap: chat server should not have been dropped
        self.cmd_tx
            .send(Command::UpdateUserAccessLevel { canvas_id, user_id, access_level })
            .unwrap();
    }

    /// Broadcast message to current room.
    pub async fn broadcast_event(&self, canvas_id: CanvasId, user_id: UserId, msg: impl Into<Msg>) {
        let (res_tx, res_rx) = oneshot::channel();

        // unwrap: chat server should not have been dropped
        self.cmd_tx
            .send(Command::HandleMessage {
                msg: msg.into(),
                canvas_id,
                user_id,
                res_tx,
            })
            .unwrap();

        // unwrap: chat server does not drop our response channel
        res_rx.await.unwrap();
    }

    /// Unregister message sender and broadcast disconnection message to current room.
    pub fn disconnect(&self, canvas_id: CanvasId, user_id: UserId) {
        // unwrap: chat server should not have been dropped
        self.cmd_tx.send(Command::Disconnect { canvas_id, user_id }).unwrap();
    }
}