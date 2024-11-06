use actix::prelude::*;
use nanoid::nanoid;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::{
    persistence::{self, PersistEventMessage},
    userstore::UserId,
};

/// Event Store for Canvas events
/// Same concept as userstore.rs

use super::error::CanvasStoreError;

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
pub const CANVAS_ID_LENGTH: usize = 12;

define_canvas_id_constants!("1234567890abcdef", 16);

#[derive(Serialize, Deserialize, PartialEq, Eq, Debug, Clone)]
#[repr(u8)]
pub enum AccessLevel {
    Read = b'R',
    Write = b'W',
    Moderate = b'M',
    Owner = b'O',
    Voice = b'V',
    None = b'N', // Meta level, never assigend to a user
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CanvasClaim {
    pub n: String,
    pub c: String,
    pub r: AccessLevel,
}

impl PartialEq for CanvasClaim {
    fn eq(&self, other: &Self) -> bool {
        self.c == other.c
    }
}

// CanvasClaim is also total equal
impl Eq for CanvasClaim {}

#[derive(Deserialize, Serialize, Clone)]
pub struct CreateCanvas {
    pub name: String,
    pub owner_id: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub enum CanvasState {
    Active,
    Moderated,
}

/// User struct as it is stored in the eventlog
/// Can be obtained from RegisterUserMessage or GetUserMessage
#[derive(Deserialize, Serialize, Clone)]
pub struct Canvas {
    pub id: String,
    pub name: String,
    pub owner_id: String,
    pub state: CanvasState,
    pub users: HashMap<UserId, AccessLevel>,
}

pub type CanvasId = String;

pub struct CanvasStore {
    /// Address to the persistence actor, used to save and read events
    event_persistence_recipient: Recipient<PersistEventMessage<CanvasStoreEvents>>,

    canvases: HashMap<CanvasId, Canvas>,

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
                CanvasStoreEvents::CanvasCreated {
                    canvas_id,
                    name,
                    owner_id,
                    state,
                    ..
                } => {
                    let claim = CanvasClaim {
                        n: name.clone(),
                        c: canvas_id.clone(),
                        r: AccessLevel::Owner,
                    };

                    let mut users = HashMap::with_capacity(1);
                    users.insert(owner_id.clone(), AccessLevel::Owner);

                    canvas.insert(
                        canvas_id.clone(),
                        Canvas {
                            id: canvas_id.clone(),
                            name,
                            owner_id: owner_id.clone(),
                            state,
                            users,
                        },
                    );
                    user_id_lookup
                        .entry(owner_id)
                        .and_modify(|e: &mut Vec<CanvasClaim>| e.push(claim.clone()))
                        .or_insert(vec![claim]);
                }
                CanvasStoreEvents::UserCanvasAdded {
                    user_id,
                    canvas_id,
                    access_level,
                    ..
                } => {
                    let canvas_entry = canvas.entry(canvas_id.clone());

                    let canvas = match canvas_entry {
                        std::collections::hash_map::Entry::Occupied(e) => e.into_mut(),
                        std::collections::hash_map::Entry::Vacant(_) => anyhow::bail!(
                            "Canvas {} for user {} does not exist",
                            canvas_id,
                            user_id
                        ),
                    };

                    let claim = CanvasClaim {
                        n: canvas.name.clone(),
                        c: canvas_id.clone(),
                        r: access_level.clone(),
                    };

                    user_id_lookup
                        .entry(user_id.clone())
                        .and_modify(|e: &mut Vec<CanvasClaim>| {
                            e.iter().position(|c| c == &claim).map(|i| e.swap_remove(i));
                            e.push(claim.clone());
                        })
                        .or_insert(vec![claim.clone()]);

                    canvas.users.insert(user_id, access_level);
                }
                _ => (),
            }
        }

        Ok(Self {
            event_persistence_recipient,
            canvases: canvas,
            user_id_lookup,
        })
    }
}

impl CanvasStore {
    fn get_access_level(&self, user_id: &UserId, canvas_id: &CanvasId) -> AccessLevel {
        self.user_id_lookup
            .get(user_id)
            .map(|claims| {
                claims
                    .iter()
                    .find(|claim| claim.c == *canvas_id)
                    .map(|claim| claim.r.clone())
                    .unwrap_or(AccessLevel::None)
            })
            .unwrap_or(AccessLevel::None)
    }

    fn validate_permission_change(
        &self,
        initiator_access_level: &AccessLevel,
        target_access_level: &AccessLevel,
        access_level: &AccessLevel,
    ) -> Result<(), CanvasStoreError> {
        match (initiator_access_level, target_access_level, access_level) {
            // owner can't change himself
            (AccessLevel::Owner, AccessLevel::Owner, _) => Err(CanvasStoreError::AccessDenied(
                String::from("Owner can't change his own access level"),
            )),
            // owner can't elect a new owner
            (AccessLevel::Owner, _, AccessLevel::Owner) => Err(CanvasStoreError::AccessDenied(
                String::from("Owner can't assign owner access level"),
            )),

            // owner can change anything else
            (AccessLevel::Owner, _, _) => Ok(()),

            // moderate can't change owner nor moderator
            (AccessLevel::Moderate, AccessLevel::Owner | AccessLevel::Moderate, _) => {
                Err(CanvasStoreError::AccessDenied(String::from(
                    "Moderate can't change owner or moderate access level",
                )))
            }
            // moderate can't assign owner nor moderate
            (AccessLevel::Moderate, _, AccessLevel::Owner | AccessLevel::Moderate) => {
                Err(CanvasStoreError::AccessDenied(String::from(
                    "Moderate can't assign owner or moderate access level",
                )))
            }

            // moderator is allowed to change any users access level that is left
            (AccessLevel::Moderate, _, _) => Ok(()),

            // non moderate or owner can't change anything
            (_, _, _) => Err(CanvasStoreError::AccessDenied(String::from(
                "User can't change access level",
            ))),
        }
    }
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
        state: CanvasState,
        name: String,
    },
    /// Deletes a canvas
    CanvasDeleted { timestamp: u64, canvas_id: CanvasId },
    /// Adds the user to a canvas (this is mirrored in the canvas store, to make lookups easier)
    UserCanvasAdded {
        timestamp: u64,
        user_id: UserId,
        initiator_user_id: UserId,
        canvas_id: CanvasId,
        access_level: AccessLevel,
    },
    /// Removes the user from a canvas (this is mirrored in the canvas store, to make lookups easier)
    UserCanvasRemoved {
        timestamp: u64,
        user_id: String,
        canvas_id: CanvasId,
    },
    /// Changes the state of a canvas, moderated, active etc.
    CanvasStateChanged {
        timestamp: u64,
        canvas_id: CanvasId,
        initiator_id: UserId,
        state: CanvasState,
    },
}

#[derive(Message)]
#[rtype(result = "Result<(), std::io::Error>")]
pub struct UpdateCanvasStateMessage {
    pub canvas_id: CanvasId,
    pub initiator_id: UserId,
    pub state: CanvasState,
}

impl Handler<UpdateCanvasStateMessage> for CanvasStore {
    type Result = AtomicResponse<Self, Result<(), std::io::Error>>;

    fn handle(&mut self, msg: UpdateCanvasStateMessage, _: &mut Self::Context) -> Self::Result {
        let event = CanvasStoreEvents::CanvasStateChanged {
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            canvas_id: msg.canvas_id.clone(),
            initiator_id: msg.initiator_id.clone(),
            state: msg.state.clone(),
        };

        AtomicResponse::new(Box::pin(
            self.event_persistence_recipient
                .send(persistence::PersistEventMessage(event))
                .into_actor(self)
                .map(move |result, canvasstore, _| {
                    match result {
                        Ok(Ok(_)) => {
                            // insert after persistence
                            if let Some(canvas) = canvasstore.canvases.get_mut(&msg.canvas_id) {
                                canvas.state = msg.state;
                            }
                            Ok(())
                        }
                        Ok(Err(_)) => Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            "Failed to persist event",
                        )),
                        Err(_) => Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            "Failed to persist event",
                        )),
                    }
                }),
        ))
    }
}

#[derive(Message)]
#[rtype(result = "Result<Canvas, std::io::Error>")]
pub struct CreateCanvasMessage {
    pub canvas: CreateCanvas,
}

impl Handler<CreateCanvasMessage> for CanvasStore {
    type Result = AtomicResponse<Self, Result<Canvas, std::io::Error>>;

    // This function is atomic, meaning that the actor will not be able to handle any other messages until the response is resolved
    fn handle(&mut self, msg: CreateCanvasMessage, _: &mut Self::Context) -> Self::Result {
        let id = (0..MAX_ID_GENERATION_ITERATIONS)
            .map(|_| nanoid!(CANVAS_ID_LENGTH, &CANVAS_ID_ALPHABET))
            .find(|id| !self.canvases.contains_key(id))
            .ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "Failed to generate unique user id",
                )
            });

        let id = match id {
            Ok(id) => id,
            Err(e) => return AtomicResponse::new(Box::pin(async move { Err(e) }.into_actor(self))),
        };

        let mut users = HashMap::with_capacity(1);
        users.insert(msg.canvas.owner_id.clone(), AccessLevel::Owner);

        let canvas = Canvas {
            id: id.clone(),
            name: msg.canvas.name.clone(),
            owner_id: msg.canvas.owner_id.clone(),
            state: CanvasState::Active,
            users,
        };

        let event = CanvasStoreEvents::CanvasCreated {
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            owner_id: msg.canvas.owner_id.clone(),
            canvas_id: id.clone(),
            state: canvas.state.clone(),
            name: msg.canvas.name.clone(),
        };

        self.canvases.insert(id.clone(), canvas.clone());

        let canvas_claim = CanvasClaim {
            n: msg.canvas.name,
            c: id,
            r: AccessLevel::Owner,
        };
        self.user_id_lookup
            .entry(msg.canvas.owner_id)
            .and_modify(|e: &mut Vec<CanvasClaim>| e.push(canvas_claim.clone())) // clone here sucks
            .or_insert(vec![canvas_claim]);

        AtomicResponse::new(Box::pin(
            self.event_persistence_recipient
                .send(persistence::PersistEventMessage(event))
                .into_actor(self)
                .map(|result, canvasstore, _| {
                    let canvas_for_error = canvas.clone(); // same as userstore this whole future thing already took to long to figure out, just copy user for error handling
                    match result {
                        Ok(Ok(_)) => Ok(canvas),
                        Ok(Err(_)) => Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            "Failed to persist create event",
                        )),
                        Err(_) => Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            "Failed to persist create event",
                        )),
                    }
                    .map_err(|error| {
                        canvasstore.canvases.remove(&canvas_for_error.id);
                        canvasstore
                            .user_id_lookup
                            .entry(canvas_for_error.owner_id)
                            .and_modify(|e: &mut Vec<CanvasClaim>| {
                                e.retain(|c| c.c != canvas_for_error.id)
                            });
                        error
                    })
                }),
        ))
    }
}

#[derive(Message)]
#[rtype(result = "Vec<CanvasClaim>")]
pub struct GetUserClaimsMessage {
    pub user_id: UserId,
}

impl Handler<GetUserClaimsMessage> for CanvasStore {
    type Result = Vec<CanvasClaim>;

    fn handle(&mut self, msg: GetUserClaimsMessage, _: &mut Self::Context) -> Self::Result {
        self.user_id_lookup
            .get(&msg.user_id)
            .map_or(Vec::new(), Clone::clone)
    }
}

#[derive(Message, Clone)]
#[rtype(result = "Option<Canvas>")]
pub struct GetCanvasMessage {
    pub canvas_id: CanvasId,
}

impl Handler<GetCanvasMessage> for CanvasStore {
    type Result = Option<Canvas>;

    fn handle(&mut self, msg: GetCanvasMessage, _: &mut Self::Context) -> Self::Result {
        self.canvases.get(&msg.canvas_id).cloned()
    }
}

#[derive(Message, Clone)]
#[rtype(result = "Result<(), CanvasStoreError>")]
pub struct AddUserToCanvasMessage {
    pub initiator_user_id: UserId,
    pub canvas_id: CanvasId,
    pub target_user_id: UserId,
    pub access_level: AccessLevel,
}

impl Handler<AddUserToCanvasMessage> for CanvasStore {
    type Result = AtomicResponse<Self, Result<(), CanvasStoreError>>;

    fn handle(&mut self, msg: AddUserToCanvasMessage, _: &mut Self::Context) -> Self::Result {
        if self.canvases.get(&msg.canvas_id).is_none() {
            return AtomicResponse::new(Box::pin(
                async move { Err(CanvasStoreError::CanvasNotFound) }.into_actor(self),
            ));
        }

        let target_access_level = self.get_access_level(&msg.target_user_id, &msg.canvas_id);
        let initiator_access_level = self.get_access_level(&msg.initiator_user_id, &msg.canvas_id);

        if let Err(e) = self.validate_permission_change(
            &initiator_access_level,
            &target_access_level,
            &msg.access_level,
        ) {
            return AtomicResponse::new(Box::pin(async move { Err(e) }.into_actor(self)));
        }

        let event = CanvasStoreEvents::UserCanvasAdded {
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            user_id: msg.target_user_id.clone(),
            initiator_user_id: msg.initiator_user_id.clone(),
            canvas_id: msg.canvas_id.clone(),
            access_level: msg.access_level.clone(),
        };

        AtomicResponse::new(Box::pin(
            self.event_persistence_recipient
                .send(persistence::PersistEventMessage(event))
                .into_actor(self)
                .map(move |result, canvasstore, _| {
                    match result {
                        Ok(Ok(_)) => {
                            let msg = msg.clone();

                            // perform state update, after event is persisted

                            // canvas is guaranteed to exist, CanvasStore is not multi-threaded,
                            // AtomicRepsonse is used for exlusive state access
                            let canvas = canvasstore.canvases.get_mut(&msg.canvas_id).unwrap();
                            canvas
                                .users
                                .entry(msg.target_user_id.clone())
                                .and_modify(|a| *a = msg.access_level.clone())
                                .or_insert(msg.access_level.clone());

                            // update lookup cache, oof
                            canvasstore
                                .user_id_lookup
                                .entry(msg.target_user_id)
                                .and_modify(|claims| {
                                    if let Some(claim) =
                                        claims.iter_mut().find(|claim| claim.c == msg.canvas_id)
                                    {
                                        claim.r = msg.access_level.clone();
                                    } else {
                                        claims.push(CanvasClaim {
                                            n: canvas.name.clone(),
                                            c: msg.canvas_id.clone(),
                                            r: msg.access_level.clone(),
                                        });
                                    }
                                })
                                .or_insert(vec![CanvasClaim {
                                    n: canvas.name.clone(),
                                    c: msg.canvas_id,
                                    r: msg.access_level,
                                }]);

                            Ok(())
                        }
                        Ok(Err(_)) => Err(CanvasStoreError::PersistenceFailed),
                        Err(_) => Err(CanvasStoreError::PersistenceFailed),
                    }
                }),
        ))
    }
}

#[cfg(test)]
mod tests {
    use persistence::EventLogPersistenceJson;

    use super::*;

    #[actix_web::test]
    async fn test_access_level_validation() {
        // Canvas Store Setup
        // Same constraints as for the user store
        let canvas_event_log = EventLogPersistenceJson::new("test.jsonl")
            .expect("Failed to create or load canvas event log");
        let (_, canvas_event_log) = canvas_event_log
            .into_actor::<CanvasStoreEvents>()
            .expect("Failed to read canvas event log");
        let canvas_event_persistor_recipient = canvas_event_log.start().recipient();

        // NOTE: not used right now in test, can be used later
        let initial_events = vec![
            CanvasStoreEvents::CanvasCreated {
                timestamp: 0,
                owner_id: "owner".to_string(),
                canvas_id: "canvas".to_string(),
                state: CanvasState::Active,
                name: "Canvas".to_string(),
            },
            CanvasStoreEvents::UserCanvasAdded {
                timestamp: 0,
                user_id: "moderator".to_string(),
                initiator_user_id: "owner".to_string(),
                canvas_id: "canvas".to_string(),
                access_level: AccessLevel::Moderate,
            },
            CanvasStoreEvents::UserCanvasAdded {
                timestamp: 0,
                user_id: "reader".to_string(),
                initiator_user_id: "owner".to_string(),
                canvas_id: "canvas".to_string(),
                access_level: AccessLevel::Read,
            },
            CanvasStoreEvents::UserCanvasAdded {
                timestamp: 0,
                user_id: "writer".to_string(),
                initiator_user_id: "owner".to_string(),
                canvas_id: "canvas".to_string(),
                access_level: AccessLevel::Write,
            },
            CanvasStoreEvents::UserCanvasAdded {
                timestamp: 0,
                user_id: "voice".to_string(),
                initiator_user_id: "owner".to_string(),
                canvas_id: "canvas".to_string(),
                access_level: AccessLevel::Voice,
            },
        ];

        let canvas_store = CanvasStore::new(canvas_event_persistor_recipient, initial_events)
            .expect("Failed to parse persisted event log");

        // note this does not use messages, only checks the validation function

        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Read,
                &AccessLevel::Moderate,
                &AccessLevel::Write
            )
            .is_err());
        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Read,
                &AccessLevel::Owner,
                &AccessLevel::Moderate
            )
            .is_err());
        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Moderate,
                &AccessLevel::Moderate,
                &AccessLevel::Write
            )
            .is_err());
        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Moderate,
                &AccessLevel::Owner,
                &AccessLevel::Write
            )
            .is_err());
        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Moderate,
                &AccessLevel::None,
                &AccessLevel::Owner
            )
            .is_err());
        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Moderate,
                &AccessLevel::None,
                &AccessLevel::Moderate
            )
            .is_err());
        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Moderate,
                &AccessLevel::Voice,
                &AccessLevel::Moderate
            )
            .is_err());

        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Write,
                &AccessLevel::Moderate,
                &AccessLevel::Write
            )
            .is_err());
        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Voice,
                &AccessLevel::Moderate,
                &AccessLevel::Write
            )
            .is_err());
        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::None,
                &AccessLevel::Moderate,
                &AccessLevel::Write
            )
            .is_err());

        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Owner,
                &AccessLevel::Moderate,
                &AccessLevel::Write
            )
            .is_ok());
        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Owner,
                &AccessLevel::None,
                &AccessLevel::Moderate
            )
            .is_ok());
        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Moderate,
                &AccessLevel::Write,
                &AccessLevel::Read
            )
            .is_ok());
        assert!(canvas_store
            .validate_permission_change(
                &AccessLevel::Moderate,
                &AccessLevel::Voice,
                &AccessLevel::None
            )
            .is_ok());
    }
}
