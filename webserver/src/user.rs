use crate::authentication::{self, JWTClaims};
use crate::canvas::store::GetUserClaimsMessage;
use crate::templates;
use crate::userstore::{GetUserMessage, RegisterUser, RegisterUserMessage};
use actix::Recipient;
use actix_web::{cookie::Cookie, error, get, post, web, HttpResponse, Responder, Result};
use actix_web::{HttpMessage, HttpRequest};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use handlebars::Handlebars;
use serde::Deserialize;
use serde_json::json;

pub const JWT_SECRET: &str = "secret";
pub const AUTH_COOKIE_NAME: &str = "auth-token";

#[derive(Deserialize)]
struct LoginForm {
    username_email: String,
    password: String,
}

#[derive(Deserialize)]
struct RegisterForm {
    username: String,
    email: String,
    password1: String,
    password2: String,
}

#[get("/login", name = "login")]
async fn login_page(request: HttpRequest) -> Result<impl Responder> {
    templates::serve_template("login.html", &request).await
}

#[post("/login")]
async fn login(
    request: HttpRequest,
    login_form: web::Form<LoginForm>,
    user_store_addr: web::Data<Recipient<GetUserMessage>>,
    canvas_claims_addr: web::Data<Recipient<GetUserClaimsMessage>>,
    argon: web::Data<Argon2<'_>>,
) -> Result<impl Responder> {
    let user = user_store_addr
        .send(GetUserMessage {
            username_email: Some(login_form.username_email.clone()),
            user_id: None,
        })
        .await
        .map_err(|_| error::ErrorInternalServerError("Failed to login, try again later"))?;

    if let Some(user) = user {
        let parsed_hash = PasswordHash::new(&user.password_hash)
            .map_err(|_| error::ErrorInternalServerError("Failed to login, try again later"))?;

        let password_check = argon.verify_password(login_form.password.as_bytes(), &parsed_hash);

        if password_check.is_ok() {
            let claims = canvas_claims_addr
                .send(GetUserClaimsMessage {
                    user_id: user.id.clone(),
                })
                .await
                .map_err(|_| error::ErrorInternalServerError("Failed to login, try again later"))?;
            //TODO: consider logging alterting system, if this error occurs, something is very wrong

            let jwt_token = authentication::generate_jwt_token(user.into(), claims)?;
            let mut redirect_response = templates::builder_redirect_to_static("home", &request);
            return Ok(redirect_response
                .cookie(
                    Cookie::build(AUTH_COOKIE_NAME, jwt_token)
                        .same_site(actix_web::cookie::SameSite::Lax) // prevents CSRF for POST requests
                        .http_only(true) // prevents some XSS attacks
                        .path("/")
                        .finish(),
                )
                .finish());
        }

        Ok(HttpResponse::Forbidden().body("Invalid password or username"))
    } else {
        Ok(HttpResponse::BadRequest().body("User does not exist"))
    }
}

#[get("/register", name = "register")]
async fn register_page(request: HttpRequest) -> Result<impl Responder> {
    templates::serve_template("register.html", &request).await
}

#[post("/register")]
async fn register(
    request: HttpRequest,
    register_form: web::Form<RegisterForm>,
    user_store_addr: web::Data<Recipient<RegisterUserMessage>>,
    argon: web::Data<Argon2<'_>>,
) -> Result<impl Responder> {
    if register_form.password1 != register_form.password2 {
        return Ok(HttpResponse::BadRequest().body("Passwords do not match"));
    }

    let salt = SaltString::generate(&mut OsRng);

    // Hash password to PHC string ($argon2id$v=19$...)
    let password_hash = argon
        .hash_password(register_form.password1.clone().as_bytes(), &salt)
        .map_err(|_| error::ErrorInternalServerError("Registration Failed"))?
        .to_string();

    let _ = user_store_addr
        .send(RegisterUserMessage {
            user: RegisterUser {
                email: register_form.email.clone(),
                username: register_form.username.clone(),
                password_hash: password_hash.clone(),
            },
        })
        .await
        .map_err(|_| error::ErrorInternalServerError("Failed to register, try again later"))??;
    // TODO: better error handling if user already exists

    Ok(templates::redirect_to_static("login", &request))
}

#[post("/logout")]
async fn logout_handler(request: HttpRequest) -> impl Responder {
    let mut redirect_response = templates::builder_redirect_to_static("login", &request);
    // redirect_response.
    let mut cookie = Cookie::build(AUTH_COOKIE_NAME, "")
        .same_site(actix_web::cookie::SameSite::Lax)
        .http_only(true)
        .path("/")
        .finish();
    cookie.make_removal();

    redirect_response.cookie(cookie);
    redirect_response.finish()
}

async fn home_request_handler(
    request: HttpRequest,
    handlebars: web::Data<Handlebars<'_>>,
) -> actix_web::Result<impl Responder> {
    let user_data = request.extensions().get::<JWTClaims>().map_or(
        Err(error::ErrorUnauthorized("Failed to authenticate")),
        |claims| Ok(claims.clone()),
    )?;

    let canvas: Vec<_> = user_data
        .can
        .iter()
        .map(|claim| {
            json!({
                "name": claim.n,
                "id": claim.c,
                "access_level": claim.r,
            })
        })
        .collect();

    let template_data = json!({
        "id": user_data.uid,
        "name": user_data.nam,
        "canvas": canvas,
    });

    handlebars
        .render("home", &template_data)
        .map(web::Html::new)
        .map_err(|_| error::ErrorInternalServerError("Failed to render home"))

    // match rendered {
    // Ok(rendered) => Ok(HttpResponse::Ok().body(rendered)),
    // Err(e) => {
    // eprintln!("Failed to render /home template {}", e);
    // Err(HttpResponse::InternalServerError("Failed to display home").finish())
    // }
    // }
}

pub fn user_service(cfg: &mut web::ServiceConfig) {
    cfg.service(login)
        .service(login_page)
        .service(register)
        .service(register_page)
        .service(logout_handler)
        .service(
            web::resource("/home")
                .name("home")
                .wrap(authentication::AuthenticationService) // requires authentication
                .route(web::get().to(home_request_handler)),
        );
}
