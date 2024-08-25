use actix::prelude::*;
use actix_web::{middleware::Logger, web, App, HttpRequest, HttpServer, Responder};
use argon2::Argon2;
use canvas::store::{CanvasStore, CreateCanvasMessage, GetUserClaimsMessage};
use env_logger::Env;
use handlebars::{DirectorySourceOptions, Handlebars};
use persistence::EventLogPersistenceJson;
use userstore::{GetUserMessage, RegisterUserMessage, UserStore};

mod authentication;
mod canvas;
mod persistence;
mod spa;
mod templates;
mod user;
mod userstore;

#[cfg(feature = "dev")]
static TEMPLATE_DIR: &str = "../.templates";
#[cfg(not(feature = "dev"))]
static TEMPLATE_DIR: &str = "../dist/.templates";

async fn root_request_handler(
    request: HttpRequest,
    // handlebars: web::Data<Handlebars<'_>>
) -> actix_web::Result<impl Responder> {
    templates::serve_index(&request).await
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // User Store
    // User event store setup, creates persistence actor and user store actor
    // persistence can be swapped out for a different implementation
    // user store can later be replaced by a database
    let user_event_log = EventLogPersistenceJson::new("user_eventlog.jsonl")
        .expect("Failed to create or load user event log");
    let (saved_events, user_event_log) = user_event_log
        .initialize()
        .expect("Failed to read user event log");
    let user_event_persistor_recipient = user_event_log.start().recipient();
    // use recipients to allow for easier swapping of implementations
    let user_store_addr = UserStore::new(user_event_persistor_recipient, saved_events).start();

    let register_user_receipient =
        web::Data::new(user_store_addr.clone().recipient::<RegisterUserMessage>());
    let get_user_receipient = web::Data::new(user_store_addr.recipient::<GetUserMessage>());


    // Canvas Store Setup
    // Same constraints as for the user store
    let canvas_event_log = EventLogPersistenceJson::new("canvas_eventlog.jsonl")
        .expect("Failed to create or load canvas event log");
    let (saved_events, canvas_event_log) = canvas_event_log
        .initialize()
        .expect("Failed to read canvas event log");
    let canvas_event_persistor_recipient = canvas_event_log.start().recipient();
    let canvas_store_addr = CanvasStore::new(canvas_event_persistor_recipient, saved_events)
        .expect("Failed to parse persisted event log")
        .start();

    let create_canvas_receipient =
        web::Data::new(canvas_store_addr.clone().recipient::<CreateCanvasMessage>());
    let get_user_claims_receipient =
        web::Data::new(canvas_store_addr.clone().recipient::<GetUserClaimsMessage>());

    // Argon Setup
    let argon_params = argon2::Params::new(19 * 1024, 3, 2, None).map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::Other, "Failed to create argon2 params")
    })?;


    // Logging
    env_logger::init_from_env(Env::default().default_filter_or("debug"));


    // Templating
    // Handlebar stores compiled templates, so it needs to be shared between threads
    println!("Template dir: {}", TEMPLATE_DIR);
    let handlebars = {
        let mut handlebars = Handlebars::new();
        // DirectorySourceOptions is non_exhaustive, so we need to use the default method and then modify the fields we want
        // for some reason using struct expansion and ..Default::default() does not work
        let mut source_options = DirectorySourceOptions::default();
        source_options.tpl_extension = ".html".to_owned();
        handlebars
            .register_templates_directory(TEMPLATE_DIR, source_options)
            .expect("Failed to register templates");
        web::Data::new(handlebars)
    };

    // https://tokio.rs/tokio/tutorial/shared-state#on-using-stdsyncmutex

    HttpServer::new(move || {
        // Uses some inspiration taken from https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id for configuration
        // pepper/secret not used
        // save in state to avoid re-creating the argon2 instance for every request and possibly mixing configurations
        // created for every worker thread
        let argon2 = web::Data::new(Argon2::new(
            argon2::Algorithm::Argon2id,
            argon2::Version::V0x13,
            argon_params.clone(),
        ));

        App::new()
            .wrap(Logger::default())
            .app_data(handlebars.clone())
            .app_data(register_user_receipient.clone())
            .app_data(get_user_receipient.clone())
            .app_data(create_canvas_receipient.clone())
            .app_data(get_user_claims_receipient.clone())
            .app_data(argon2)
            .configure(user::user_service)
            .configure(canvas::canvas_service)
            .route("/", web::get().to(root_request_handler))
            .wrap(spa::SPAService)
            .service(actix_files::Files::new("/", "../dist").index_file("index.html"))
    })
    .bind(("127.0.0.1", 8080))?
    .workers(3)
    .run()
    .await
}
