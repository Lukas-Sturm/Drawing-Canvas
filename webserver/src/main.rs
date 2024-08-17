use actix_web::{middleware::Logger, web, App, HttpRequest, HttpServer, Responder};
use actix_files::{self, NamedFile};
use actix::prelude::*;
use argon2::Argon2;
use env_logger::Env;
use handlebars::{DirectorySourceOptions, Handlebars};
use persistence::EventLogPersistenceJson;
use user::userstore::{GetUserMessage, RegisterUserMessage, UserStore};

mod persistence;
mod user;
mod authentication;

async fn home(
    request: HttpRequest,
    // handlebars: web::Data<Handlebars<'_>>
) -> actix_web::Result<impl Responder> {
    if request.query_string() == "dev" {
        Ok(NamedFile::open("../.templates/canvas.html")?)
    } else {
        Ok(NamedFile::open("../dist/.templates/canvas.html")?)
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {

    // User event store setup, creates persistence actor and user store actor
    // persistence can be swapped out for a different implementation
    // user store can later be replaced by a database
    let user_event_log = EventLogPersistenceJson::new("user_eventlog.jsonl").expect("Failed to create or load user event log");
    let (saved_events, user_event_log) = user_event_log.initialize().expect("Failed to read user event log");
    let user_event_persistor_recipient = user_event_log.start().recipient();
    // use recipients to allow for easier swapping of implementations
    let user_store_addr = UserStore::new(user_event_persistor_recipient, saved_events).start();

    let register_user_receipient = web::Data::new(user_store_addr.clone().recipient::<RegisterUserMessage>());
    let get_user_receipient = web::Data::new(user_store_addr.recipient::<GetUserMessage>());

    let argon_params = argon2::Params::new(19 * 1024, 3, 1, None)
        .map_err(|_| 
            std::io::Error::new(std::io::ErrorKind::Other, "Failed to create argon2 params")
        )?;

    env_logger::init_from_env(Env::default().default_filter_or("debug"));

    // Handlebar stores compiled templates, so it needs to be shared between threads
    let handlebars = {
        let mut handlebars = Handlebars::new();
        // DirectorySourceOptions is non_exhaustive, so we need to use the default method and then modify the fields we want
        // for some reason using struct expansion and ..Default::default() does not work
        let mut source_options = DirectorySourceOptions::default();
        source_options.tpl_extension = ".html".to_owned();
        handlebars.register_templates_directory(
            "../templates",
            source_options
        ).expect("Failed to register templates");
        web::Data::new(handlebars)
    };

    // https://tokio.rs/tokio/tutorial/shared-state#on-using-stdsyncmutex

    HttpServer::new(move || {
    
        // Uses some inspiration taken from https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id for configuration
        // pepper/secret not used
        // save in state to avoid re-creating the argon2 instance for every request and possibly mixing configurations
        // created for every worker thread
        let argon2 = web::Data::new(
            Argon2::new(
                argon2::Algorithm::Argon2id,
                argon2::Version::V0x13,
                argon_params.clone()
            )
        );

        App::new()
            .wrap(Logger::default())
            .app_data(handlebars.clone())
            .app_data(register_user_receipient.clone())
            .app_data(get_user_receipient.clone())
            .app_data(argon2)
            .configure(user::user_service)
            .service(
                web::resource("/home")
                    .wrap(authentication::AuthenticationService) // requires authentication
                    .route(web::get().to(home))
            )
            .service(
                actix_files::Files::new("/", "../dist")
                    .index_file("index.html")
            )
    })
    .bind(("127.0.0.1", 8080))?
    .workers(3)
    .run()
    .await
}
