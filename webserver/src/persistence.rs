use actix::prelude::*;
use actix::Actor;
use actix::{Handler, Message};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};

pub struct EventLogPersistenceActorJson {
    // this could use tokio::fs::File, but synchronous file access is easier :)
    file: std::fs::File,
}

pub struct EventLogPersistenceStandaloneJson<T> {
    file: std::fs::File,
    _phantom: std::marker::PhantomData<T>,
}

impl Actor for EventLogPersistenceActorJson {
    type Context = Context<Self>;
}

pub struct EventLogPersistenceJson {
    // this could use tokio::fs::File, but synchronous file access is easier :)
    file: std::fs::File,
}

impl EventLogPersistenceJson {
    pub fn new(file_path: &str) -> Result<Self, std::io::Error> {
        let file = OpenOptions::new()
            .read(true)
            .append(true)
            .create(true)
            .open(file_path)?;

        // consider locking file
        // https://docs.rs/file-guard/latest/file_guard/
        Ok(Self { file })
    }

    /// Synchonously read and deserialize all lines from the saved eventlog
    /// transform EventLog into an actor Eventlog ready for usage in the system
    pub fn to_actor<T>(self) -> Result<(Vec<T>, EventLogPersistenceActorJson), std::io::Error>
    where
        T: DeserializeOwned,
    {
        let buffered_reader = BufReader::new(&self.file);

        // read all events from the eventlog
        let events = buffered_reader
            .lines()
            .map(|raw_line| raw_line.map(|line| serde_json::from_str::<T>(&line)))
            .collect::<Result<Vec<Result<T, serde_json::Error>>, std::io::Error>>()?;

        Ok((
            events
                .into_iter()
                .collect::<Result<Vec<T>, serde_json::Error>>()?,
            EventLogPersistenceActorJson { file: self.file },
        ))
    }

    /// Synchonously read and deserialize all lines from the saved eventlog
    /// transform EventLog into an actor Eventlog ready for usage in the system
    pub fn to_standalone<T>(self) -> Result<(Vec<T>, EventLogPersistenceStandaloneJson<T>), std::io::Error>
    where
        T: DeserializeOwned,
    {
        let buffered_reader = BufReader::new(&self.file);

        // read all events from the eventlog
        let events = buffered_reader
            .lines()
            .map(|raw_line| raw_line.map(|line| serde_json::from_str::<T>(&line)))
            .collect::<Result<Vec<Result<T, serde_json::Error>>, std::io::Error>>()?;

        Ok((
            events
                .into_iter()
                .collect::<Result<Vec<T>, serde_json::Error>>()?,
            EventLogPersistenceStandaloneJson { file: self.file, _phantom: std::marker::PhantomData },
        ))
    }
}

impl<T> EventLogPersistenceStandaloneJson<T> 
where
    T: Serialize
{
    pub fn save_event(&mut self, event: &T) -> Result<(), std::io::Error> {
        serde_json::to_writer(&self.file, event).unwrap();
        self.file.write_all(&[b'\n'])?;
        Ok(())
    }
}

#[derive(Message)]
#[rtype(result = "Result<(), std::io::Error>")]
pub struct PersistEventMessage<T>(pub T)
where
    T: Serialize;

impl<T> Handler<PersistEventMessage<T>> for EventLogPersistenceActorJson
where
    T: serde::Serialize,
{
    type Result = Result<(), std::io::Error>;

    fn handle(&mut self, msg: PersistEventMessage<T>, _: &mut Self::Context) -> Self::Result {
        // in error case, consider writing to a different file
        // in a production environment this would need to be handled more gracefully and thoughtfully
        serde_json::to_writer(&self.file, &msg.0).unwrap();
        self.file.write_all(&[b'\n'])?;

        println!("Wrote event to file");
        Ok(())
    }
}
