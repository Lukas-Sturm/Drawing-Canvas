use actix::prelude::*;
use nanoid::nanoid;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::persistence::{self, PersistEventMessage};
use crate::canvas::store::{AccessLevel, CanvasId};

pub const USER_ID_ALPHABET: [char; 16] = [
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'a', 'b', 'c', 'd', 'e', 'f',
];
pub const USER_ID_LENGTH: usize = 8;

pub type UserId = String;

#[derive(Deserialize, Serialize, Clone)]
pub struct RegisterUser {
    pub email: String,
    pub username: String,
    pub password_hash: String,
}

/// User struct as it is stored in the eventlog
/// Can be obtained from RegisterUserMessage or GetUserMessage
#[derive(Deserialize, Serialize, Clone)]
pub struct User {
    pub id: UserId,
    pub email: String,
    pub username: String,
    pub password_hash: String,
}

pub struct SimpleUser {
    pub id: UserId,
    pub username: String,
    pub email: String,
}

impl From<User> for SimpleUser {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            username: user.username,
            email: user.email,
        }
    }
}

pub struct UserStore {
    /// Address to the persistence actor, used to save and read events
    event_persistence_recipient: Recipient<PersistEventMessage<UserStoreEvents>>,

    users_id_lookup: HashMap<UserId, User>,
    // this requires a double lookup, but is way easier than using references
    // this is because the Actor has a static lifetime, which in turn requires the UserStore to have a static lifetime
    // which then requires the User reference to have a static lifetime
    // another possible solution would be to use Arc or Rc (as this actor is single-threaded and only one exists)
    users_email_lookup: HashMap<String, UserId>,
    users_username_lookup: HashMap<String, UserId>,
}

impl UserStore {
    pub fn new(
        event_persistence_recipient: Recipient<PersistEventMessage<UserStoreEvents>>,
        saved_events: Vec<UserStoreEvents>,
    ) -> Self {
        let mut users_id_lookup = HashMap::new();
        let mut users_email_lookup = HashMap::new();
        let mut users_username_lookup = HashMap::new();

        // events are applied in order, so we can just iterate over them
        for event in saved_events {
            match event {
                UserStoreEvents::UserRegistered { user_id, user, .. } => {
                    users_email_lookup.insert(user.email.clone(), user_id.clone());
                    users_username_lookup.insert(user.username.clone(), user_id.clone());
                    users_id_lookup.insert(user_id, user);
                }
                UserStoreEvents::UserChanged { user_id, user, .. } => {
                    users_email_lookup.insert(user.email.clone(), user_id.clone());
                    users_username_lookup.insert(user.username.clone(), user_id.clone());
                    users_id_lookup.insert(user_id, user);
                }
                UserStoreEvents::UserDeleted { user_id, .. } => {
                    if let Some(user) = users_id_lookup.remove(&user_id) {
                        users_email_lookup.remove(&user.email);
                        users_username_lookup.remove(&user.username);
                    }
                }
                _ => (),
            }
        }

        Self {
            event_persistence_recipient,
            users_id_lookup,
            users_username_lookup,
            users_email_lookup,
        }
    }
}

impl Actor for UserStore {
    type Context = Context<Self>;
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type")]
#[allow(clippy::enum_variant_names)] // Canvas Application uses this naming convention
pub enum UserStoreEvents {
    /// Register a new user
    UserRegistered {
        timestamp: u64,
        user_id: UserId,
        user: User,
    },
    /// Change user data (this is simply a full overwrite)
    UserChanged {
        timestamp: u64,
        user_id: UserId,
        user: User,
    },
    /// Delete a user
    UserDeleted { timestamp: u64, user_id: UserId },
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
        user_id: UserId,
        canvas_id: CanvasId,
    },
}

#[derive(Message)]
#[rtype(result = "Result<User, std::io::Error>")]
pub struct RegisterUserMessage {
    pub user: RegisterUser,
}

impl Handler<RegisterUserMessage> for UserStore {
    type Result = AtomicResponse<Self, Result<User, std::io::Error>>;

    // Handles registration of a new user
    // This function is atomic, meaning that the actor will not be able to handle any other messages until the response is resolved
    fn handle(&mut self, msg: RegisterUserMessage, _: &mut Self::Context) -> Self::Result {
        if self.users_email_lookup.contains_key(&msg.user.email) {
            return AtomicResponse::new(Box::pin(
                async move {
                    Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        "User already exists",
                    ))
                }
                .into_actor(self),
            ));
        }

        if self.users_username_lookup.contains_key(&msg.user.username) {
            return AtomicResponse::new(Box::pin(
                async move {
                    Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        "Username already taken",
                    ))
                }
                .into_actor(self),
            ));
        }

        let mut iteration = 0;
        let mut id = nanoid!(USER_ID_LENGTH, &USER_ID_ALPHABET);
        while self.users_id_lookup.contains_key(&id) {
            id = nanoid!(USER_ID_LENGTH, &USER_ID_ALPHABET);
            iteration += 1;
            if iteration > 10 {
                // not sure if this is the nicest way
                return AtomicResponse::new(Box::pin(
                    async move {
                        Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            "Failed to generate unique user id",
                        ))
                    }
                    .into_actor(self),
                ));
            }
        }

        let user = User {
            id: id.clone(),
            email: msg.user.email,
            username: msg.user.username,
            password_hash: msg.user.password_hash,
        };

        let event = UserStoreEvents::UserRegistered {
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            user_id: id.clone(),
            user: user.clone(),
        };

        // change internal state befor persisting the event
        // I am not 100% sure if AtomicResponse realy does not allow other messages to be handled before the persistance is done
        // this is done to prevent any race conditions creating multiple users with the same id / username / email
        self.users_username_lookup
            .insert(user.username.clone(), id.clone());
        self.users_email_lookup
            .insert(user.email.clone(), id.clone());
        self.users_id_lookup.insert(id, user.clone());

        // atomic response means that the actor will not be able to handle any other messages until the response is resolved
        AtomicResponse::new(Box::pin(
            self.event_persistence_recipient
                .send(persistence::PersistEventMessage(event))
                .into_actor(self)
                .map(|c, userstore, _| {
                    let user_for_error = user.clone(); // this whole future thing already took to long to figure out, just copy user for error handling
                    match c {
                        Ok(Ok(_)) => Ok(user),
                        Ok(Err(_)) => Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            "Failed to save user registration event",
                        )),
                        Err(_) => Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            "Failed to save user registration event",
                        )),
                    }
                    .map_err(|error| {
                        // undo changes if event could not be saved
                        userstore
                            .users_username_lookup
                            .remove(&user_for_error.username);
                        userstore.users_email_lookup.remove(&user_for_error.email);
                        userstore.users_id_lookup.remove(&user_for_error.id);
                        error
                    })
                }),
        
        ))
    }
}

#[derive(Message)]
#[rtype(result = "Option<User>")]
pub struct GetUserMessage {
    pub username_email: Option<String>,
    pub user_id: Option<UserId>,
}


impl Handler<GetUserMessage> for UserStore {
    type Result = Option<User>;

    fn handle(&mut self, msg: GetUserMessage, _: &mut Self::Context) -> Self::Result {
        if let Some(user_id) = msg.user_id {
            return self.users_id_lookup.get(&user_id).map(Clone::clone);
        }

        msg.username_email.map(| username_email | {
            self.users_email_lookup
                .get(&username_email) // check using email
                .map(|id| {
                    self.users_id_lookup
                        .get(id)
                        .map(|user| Some(user.clone()))
                        .unwrap_or(None)
                })
                .unwrap_or_else(|| // not found using email
                self.users_username_lookup
                    .get(&username_email) // now check the username
                    .map(|id|
                        self.users_id_lookup
                            .get(id)
                            .map(|user| Some(user.clone()))
                            .unwrap_or(None)
                    )
                    .unwrap_or(None)) // not found
        }).unwrap_or_default()
    }
}
