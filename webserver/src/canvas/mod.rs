use crate::{
    authentication::{self, JWTClaims, RegenerateJWTMarker},
    templates, userstore,
};
use actix_web::{
    error::{ErrorInternalServerError, ErrorUnauthorized},
    web, HttpMessage, HttpRequest, HttpResponse, Responder, Result,
};
use handlebars::Handlebars;
use serde::Deserialize;
use serde_json::json;
use server::CanvasSocketServerHandle;
use store::{
    AccessLevel, AddUserToCanvasMessage, CanvasState, CreateCanvas, CreateCanvasMessage,
    UpdateCanvasStateMessage,
};
use tokio::task::spawn_local;

pub mod error;
pub mod events;
pub mod server;
pub mod socket_handler;
pub mod store;

/// Handler for API endpoints related to canvas management

#[derive(Deserialize)]
struct CreateCanvasForm {
    name: String,
}

#[derive(Deserialize)]
struct UpdateCanvasForm {
    state: CanvasState,
}

#[derive(Deserialize)]
struct AddUserCanvasFrom {
    access_level: store::AccessLevel,
    username_email: String,
}

/// Display the canvas page
async fn canvas_page_handler(
    request: HttpRequest,
    handlebars: web::Data<Handlebars<'_>>,
    canvas_id: web::Path<String>,
) -> Result<impl Responder> {
    let user_data = request.extensions().get::<JWTClaims>().map_or(
        Err(ErrorInternalServerError("Failed to authenticate")),
        |claims| Ok(claims.clone()),
    )?;

    let claim = user_data
        .can
        .iter()
        .find(|claim| claim.c == canvas_id.as_str())
        .ok_or(ErrorUnauthorized("Not authorized to view canvas"))?;

    let template_data = json!({
        "userId": user_data.uid,
        "accessLevel": claim.r.clone(),
        "canvasName": claim.n.clone(),
        "timestamp": chrono::Utc::now().timestamp() as u64, // needed to force browser reevaluation of script
    });

    handlebars
        .render("canvas", &template_data)
        .map(web::Html::new)
        .map_err(|_| ErrorInternalServerError("Failed to render canvas"))
}

/// Add or update a user to a canvas
async fn canvas_add_user_handler(
    request: HttpRequest,
    canvas_id: web::Path<String>,
    add_user_to_canvas_receipient: web::Data<actix::Recipient<store::AddUserToCanvasMessage>>,
    get_user_recipient: web::Data<actix::Recipient<userstore::GetUserMessage>>,
    add_user_canvas_from: web::Form<AddUserCanvasFrom>,
    canvas_server_handle: web::Data<CanvasSocketServerHandle>,
) -> Result<impl Responder> {
    let user_data = request.extensions().get::<JWTClaims>().map_or(
        Err(ErrorInternalServerError("Failed to authenticate")),
        |claims| Ok(claims.clone()),
    )?;

    if let Some(target_user) = get_user_recipient
        .send(userstore::GetUserMessage {
            username_email: Some(add_user_canvas_from.username_email.clone()),
            user_id: None,
        })
        .await
        .map_err(|_| ErrorInternalServerError("Failed to change access level"))?
    {
        println!(
            "Adding user to canvas: {} added {} as {:?} to {}",
            user_data.uid, target_user.id, add_user_canvas_from.access_level, canvas_id
        );

        let canvas_id = canvas_id.into_inner();

        add_user_to_canvas_receipient
            .send(AddUserToCanvasMessage {
                initiator_user_id: user_data.uid.clone(),
                access_level: add_user_canvas_from.access_level.clone(),
                canvas_id: canvas_id.clone(),
                target_user_id: target_user.id.clone(),
            })
            .await
            .map_err(|_| ErrorInternalServerError("Failed to add user to canvas"))??;
        // TODO: actor panic or mailbox full

        // at this point access level is valid
        canvas_server_handle.update_user_permissions(
            canvas_id,
            target_user.id.clone(),
            add_user_canvas_from.access_level.clone(),
        );

        Ok(HttpResponse::Ok().body(format!(
            "{} als {:?} hinzugefügt",
            target_user.id, add_user_canvas_from.access_level
        )))
    } else {
        Ok(HttpResponse::NotFound().body("Benutzer nicht gefunden"))
    }
}

/// Update the state of a canvas
async fn canvas_update_handler(
    request: HttpRequest,
    canvas_id: web::Path<String>,
    update_canvas_state_receipient: web::Data<actix::Recipient<store::UpdateCanvasStateMessage>>,
    canvas_server_handle: web::Data<CanvasSocketServerHandle>,
    update_canvas_from: web::Form<UpdateCanvasForm>,
) -> Result<impl Responder> {
    let user_data = request.extensions().get::<JWTClaims>().map_or(
        Err(ErrorInternalServerError("Failed to authenticate")),
        |claims| Ok(claims.clone()),
    )?;

    user_data
        .can
        .iter()
        .find(|claim| {
            claim.c == canvas_id.as_str()
                && (claim.r == AccessLevel::Owner || claim.r == AccessLevel::Moderate)
        })
        .ok_or(ErrorUnauthorized("Not authorized to update canvas"))?;

    let canvas_id = canvas_id.into_inner();

    update_canvas_state_receipient
        .send(UpdateCanvasStateMessage {
            canvas_id: canvas_id.clone(),
            initiator_id: user_data.uid.clone(),
            state: update_canvas_from.state.clone(),
        })
        .await
        .map_err(|_| ErrorInternalServerError("Failed to update canvas"))??;

    canvas_server_handle.update_canvas_state(
        canvas_id,
        update_canvas_from.state.clone(),
        user_data.uid,
    );

    Ok(HttpResponse::Ok().body("Canvas aktualisiert"))
}

/// Create a new canvas
async fn canvas_create_handler(
    request: HttpRequest,
    create_canvas_from: web::Form<CreateCanvasForm>,
    create_canvas_receipient: web::Data<actix::Recipient<CreateCanvasMessage>>,
) -> Result<impl Responder> {
    let user_data = request.extensions().get::<JWTClaims>().map_or(
        Err(ErrorInternalServerError("Failed to authenticate")),
        |claims| Ok(claims.clone()),
    )?;

    let canvas_save_event = create_canvas_receipient
        .send(CreateCanvasMessage {
            canvas: CreateCanvas {
                name: create_canvas_from.name.clone(),
                owner_id: user_data.uid,
            },
        })
        .await;

    let canvas = match canvas_save_event {
        Ok(Ok(canvas)) => canvas,
        Ok(Err(_)) => return Ok(HttpResponse::InternalServerError().body("Failed to save canvas")),
        Err(_) => return Ok(HttpResponse::InternalServerError().body("Failed to save canvas")),
    };

    // mark that the JWT should be regenerated
    request.extensions_mut().insert(RegenerateJWTMarker);

    Ok(templates::redirect_to(
        "canvas",
        &request,
        [canvas.id.as_str()],
    ))
}

/// Handle websocket connections to a canvas
async fn canvas_websocket_handler(
    req: HttpRequest,
    stream: web::Payload,
    canvas_server_handle: web::Data<CanvasSocketServerHandle>,
    canvas_id: web::Path<String>,
) -> Result<HttpResponse> {
    let user_data = req
        .extensions()
        .get::<JWTClaims>()
        .map_or(Err(ErrorUnauthorized("Failed to authenticate")), |claims| {
            Ok(claims.clone())
        })?;

    let (res, session, msg_stream) = actix_ws::handle(&req, stream)?;

    // spawn websocket handler (and don't await it) so that the response is returned immediately
    spawn_local(socket_handler::start_canvas_websocket_connection(
        (**canvas_server_handle).clone(),
        session,
        msg_stream,
        canvas_id.into_inner(),
        user_data.into(),
    ));

    Ok(res)
}

/// Register the canvas service with the Actix web server
pub fn canvas_service(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/canvas")
            .wrap(authentication::AuthenticationService)
            .route("", web::post().to(canvas_create_handler))
            .service(
                web::resource("/{canvas_id}")
                    .name("canvas")
                    .route(web::get().to(canvas_page_handler))
                    .route(web::post().to(canvas_add_user_handler)),
            )
            .service(
                web::resource("/{canvas_id}/update").route(web::post().to(canvas_update_handler)),
            ),
    );
    cfg.service(
        web::resource("/ws/canvas/{canvas_id}")
            .wrap(authentication::AuthenticationService)
            .route(web::get().to(canvas_websocket_handler)),
    );
}
