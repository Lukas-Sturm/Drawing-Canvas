use actix_web::{error, middleware, web, HttpMessage, HttpRequest, HttpResponse, Responder, Result};
use handlebars::Handlebars;
use serde::Deserialize;
use crate::{authentication::{self, JWTClaims}, templates};
use store::{CreateCanvas, CreateCanvasMessage};

pub mod store;

#[derive(Deserialize)]
struct CreateCanvasForm {
    name: String,
}

async fn canvas_page_handler(
    request: HttpRequest,
    handlebars: web::Data<Handlebars<'_>>,
) -> Result<impl Responder> {
    let canvas_id = request.match_info().get("canvas_id");

    if canvas_id.is_none() {
        return Ok(HttpResponse::NotFound().body("Canvas not found!"));
    }

    let canvas_id = canvas_id.unwrap();
    println!("Canvas ID: {}", canvas_id);

    // handlebars.render("canvas", )

    templates::serve_template("canvas.html", &request)
        .await
        .map(|file| file.into_response(&request))
}

async fn canvas_create_handler(
    request: HttpRequest,
    create_canvas_from: web::Form<CreateCanvasForm>,
    create_canvas_receipient: web::Data<actix::Recipient<CreateCanvasMessage>>,
) -> Result<impl Responder> {

    println!("Creating canvas: {}", create_canvas_from.name);

    let user_data= request.extensions()
        .get::<JWTClaims>()
        .map_or(
            Err(error::ErrorInternalServerError("Failed to authenticate")),
            |claims| Ok(claims.clone()))?;

    let canvas_save_event = create_canvas_receipient.send(CreateCanvasMessage {
        canvas: CreateCanvas {
            name: create_canvas_from.name.clone(),
            owner_id: user_data.uid,
        },
    }).await;

    let canvas = match canvas_save_event {
        Ok(Ok(canvas)) => canvas,
        Ok(Err(_)) => return Ok(HttpResponse::InternalServerError().body("Failed to save canvas")),
        Err(_) => return Ok(HttpResponse::InternalServerError().body("Failed to save canvas")),
    };

    println!("Canvas created: {}", canvas.id);

    // TODO: update jwt token

    Ok(templates::redirect_to("canvas", &request, &[canvas.id.as_str()]))
}

pub fn canvas_service(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/canvas")
            .wrap(middleware::NormalizePath::trim())
            .wrap(authentication::AuthenticationService)
            .route("", web::post().to(canvas_create_handler))
            .service(
                web::resource("/{canvas_id}")
                    .name("canvas")
                    .route(web::get().to(canvas_page_handler)),
            ),
    );
}

