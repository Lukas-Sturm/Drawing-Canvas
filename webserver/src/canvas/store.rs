
use actix::prelude::*;
use nanoid::nanoid;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::{persistence::{self, PersistEventMessage}, 
userstore::UserId};

/// Constants for the canvas id generation
/// Splits the alphabet into single chars and creates a str
/// Does everything at compile time, alphabet only needs to be defined once and both constants are generated
/// Required in crate::spa to generate Regex for Websockets 
macro_rules! define_canvas_id_constants {
    ($alphabet_str:expr, $length:expr) => {
        pub const CANVAS_ID_ALPHABET_STR: &str = $alphabet_str;

        pub const fn str_to_char_array(s: &str) -> [char; $length] {
            let mut chars = ['\0'; $length];
            let bytes = s.as_bytes();
            let mut i = 0;
            while i < bytes.len() && i < $length {
                chars[i] = bytes[i] as char;
                i += 1;
            }
            chars
        }

        pub const CANVAS_ID_ALPHABET: [char; $length] = str_to_char_array(CANVAS_ID_ALPHABET_STR);
    };
}

pub const MAX_ID_GENERATION_ITERATIONS: usize = 10;
pub const CANVAS_ID_LENGTH: usize = 8;

define_canvas_id_constants!("1234567890abcdef", 16);

#[derive(Serialize, Deserialize, Debug, Clone)]
#[repr(u8)]
pub enum AccessLevel {
    Read = b'R',
    Write = b'W',
    Moderate = b'M',
    Owner = b'O',
    Voice = b'V',
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CanvasClaim {
    pub n: String,
    pub c: String,
    pub r: AccessLevel,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct CreateCanvas {
    pub name: String,
    pub owner_id: String,
}

/// User struct as it is stored in the eventlog
/// Can be obtained from RegisterUserMessage or GetUserMessage
#[derive(Deserialize, Serialize, Clone)]
pub struct Canvas {
    pub id: String,
    pub name: String,
    pub owner_id: String,
    pub users: HashMap<UserId, AccessLevel>,
}

pub type CanvasId = String;

pub struct CanvasStore {
    /// Address to the persistence actor, used to save and read events
    event_persistence_recipient: Recipient<PersistEventMessage<CanvasStoreEvents>>,

    canvas: HashMap<CanvasId, Canvas>,

    /// Lookup table for users to canvas they have access to
    user_id_lookup: HashMap<UserId, Vec<CanvasClaim>>,
}

impl CanvasStore {
    pub fn new(
        event_persistence_recipient: Recipient<PersistEventMessage<CanvasStoreEvents>>,
        saved_events: Vec<CanvasStoreEvents>,
    ) -> Result<Self, anyhow::Error> {
        let mut canvas = HashMap::new();
        let mut user_id_lookup = HashMap::new();

        // This is missing validation, e.g not more than two owners, no owner at all etc.

        // events are applied in order, so we can just iterate over them
        for event in saved_events {
            match event {
                CanvasStoreEvents::CanvasCreated { canvas_id, name, owner_id, .. } => {
                    let claim = CanvasClaim {
                        n: name.clone(),
                        c: canvas_id.clone(),
                        r: AccessLevel::Owner,
                    };

                    let mut users = HashMap::with_capacity(1);
                    users.insert(owner_id.clone(), AccessLevel::Owner);

                    canvas.insert(canvas_id.clone(), Canvas {
                        id: canvas_id.clone(),
                        name,
                        owner_id: owner_id.clone(),
                        users,
                    });
                    user_id_lookup
                        .entry(owner_id)
                        .and_modify(| e: &mut Vec<CanvasClaim> | e.push(claim.clone()))
                        .or_insert(vec![claim]);
                },
                CanvasStoreEvents::UserCanvasAdded { user_id, canvas_id, access_level, ..} => {    
                    let canvas_entry = canvas
                        .entry(canvas_id.clone());

                    let canvas = match canvas_entry {
                        std::collections::hash_map::Entry::Occupied(e) => e.into_mut(),
                        std::collections::hash_map::Entry::Vacant(_) => anyhow::bail!("Canvas {} for user {} does not exist", canvas_id, user_id),
                    };
                    
                    let claim = CanvasClaim {
                        n: canvas.name.clone(),
                        c: canvas_id.clone(),
                        r: access_level.clone(),
                    };
                    user_id_lookup
                        .entry(user_id.clone())
                        .and_modify(| e: &mut Vec<CanvasClaim> | e.push(claim.clone()))
                        .or_insert(vec![claim.clone()]);
                    
                    canvas.users.insert(user_id, access_level);
                },
                _ => (),
            }
        }

        Ok(Self {
            event_persistence_recipient,
            canvas,
            user_id_lookup,
        })
    }
}

#[derive(Message)]
#[rtype(result = "Result<Canvas, std::io::Error>")]
pub struct CreateCanvasMessage {
    pub canvas: CreateCanvas,
}

#[derive(Message)]
#[rtype(result = "Result<Canvas, std::io::Error>")]
pub struct AddUserToCanvasMessage {
    pub canvas_id: CanvasId,
    pub user_id: UserId,
    pub access_level: AccessLevel,
}

#[derive(Message)]
#[rtype(result = "Result<Option<Canvas>, std::io::Error>")]
pub struct GetCanvasMessage {
    pub canvas_id: CanvasId,
}

#[derive(Message)]
#[rtype(result = "Vec<CanvasClaim>")]
pub struct GetUserClaimsMessage {
    pub user_id: UserId,
}

impl Actor for CanvasStore {
    type Context = Context<Self>;
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type")]
#[allow(clippy::enum_variant_names)] // Canvas Application uses this naming convention
pub enum CanvasStoreEvents {
    /// Created a new canvas
    CanvasCreated {
        timestamp: u64,
        owner_id: UserId,
        canvas_id: CanvasId,
        name: String
    },
    /// Deletes a canvas
    CanvasDeleted {
        timestamp: u64,
        canvas_id: CanvasId,
    },
    /// Adds the user to a canvas (this is mirrored in the canvas store, to make lookups easier)
    UserCanvasAdded {
        timestamp: u64,
        user_id: UserId,
        canvas_id: CanvasId,
        access_level: AccessLevel,
    },
    /// Removes the user from a canvas (this is mirrored in the canvas store, to make lookups easier)
    UserCanvasRemoved {
        timestamp: u64,
        user_id: String,
        canvas_id: CanvasId,
    },
}

impl Handler<CreateCanvasMessage> for CanvasStore {
    type Result = AtomicResponse<Self, Result<Canvas, std::io::Error>>;

    // This function is atomic, meaning that the actor will not be able to handle any other messages until the response is resolved
    fn handle(&mut self, msg: CreateCanvasMessage, _: &mut Self::Context) -> Self::Result {
        
        let id = (0..MAX_ID_GENERATION_ITERATIONS)
            .map(|_| nanoid!(CANVAS_ID_LENGTH, &CANVAS_ID_ALPHABET))
            .find(|id| !self.canvas.contains_key(id))
            .ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "Failed to generate unique user id",
                )
            });

        let id = match id {
            Ok(id) => id,
            Err(e) => 
                return AtomicResponse::new(Box::pin(async move { Err(e) }.into_actor(self))),
        };

        let mut users = HashMap::with_capacity(1);
        users.insert(msg.canvas.owner_id.clone(), AccessLevel::Owner);

        let canvas = Canvas {
            id: id.clone(),
            name: msg.canvas.name.clone(),
            owner_id: msg.canvas.owner_id.clone(),
            users,
        };

        let event = CanvasStoreEvents::CanvasCreated {
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            owner_id: msg.canvas.owner_id.clone(),
            canvas_id: id.clone(),
            name: msg.canvas.name.clone(),
        };

        self.canvas.insert(id.clone(), canvas.clone());

        let canvas_claim = CanvasClaim {
            n: msg.canvas.name,
            c: id,
            r: AccessLevel::Owner,
        };
        self.user_id_lookup
            .entry(msg.canvas.owner_id)
            .and_modify(| e: &mut Vec<CanvasClaim> | e.push(canvas_claim.clone())) // clone here sucks 
            .or_insert(vec![canvas_claim]);

        AtomicResponse::new(Box::pin(
            self.event_persistence_recipient
                .send(persistence::PersistEventMessage(event))
                .into_actor(self)
                .map( | result, canvasstore, _ | {
                    let canvas_for_error = canvas.clone(); // same as userstore this whole future thing already took to long to figure out, just copy user for error handling
                    match result {
                        Ok(Ok(_)) => Ok(canvas),
                        Ok(Err(_)) => Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            "Failed to save user registration event",
                        )),
                        Err(_) => Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            "Failed to save user registration event",
                        )),
                    }.map_err(| error | {
                        canvasstore.canvas.remove(&canvas_for_error.id);
                        canvasstore.user_id_lookup
                            .entry(canvas_for_error.owner_id)
                            .and_modify(| e: &mut Vec<CanvasClaim> | e.retain(| c | c.c != canvas_for_error.id));
                        error
                    })
                })
        ))
    }
}

impl Handler<GetUserClaimsMessage> for CanvasStore {
    type Result = Vec<CanvasClaim>;

    fn handle(&mut self, msg: GetUserClaimsMessage, _: &mut Self::Context) -> Self::Result {
        self.user_id_lookup.get(&msg.user_id).map_or(Vec::new(), Clone::clone)
    }
}
