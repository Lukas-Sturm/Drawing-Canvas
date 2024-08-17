use actix::Recipient;
use actix_files::NamedFile;
use actix_web::HttpRequest;
use actix_web::{cookie::Cookie, error, get, post, web, HttpResponse, Responder, Result};
use actix_web::http::header;
use argon2::{
    password_hash::{
        rand_core::OsRng,
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString
    },
    Argon2
};
use serde::Deserialize;
use userstore::{GetUserMessage, RegisterUserMessage};
use crate::authentication;
use crate::user::userstore::RegisterUser;

pub mod userstore;

pub const JWT_SECRET: &str = "secret";
pub const AUTH_COOKIE_NAME: &str = "auth-token";

#[derive(Deserialize)]
struct LoginForm {
    username_email: String,
    password: String
}

#[derive(Deserialize)]
struct RegisterForm {
    username: String,
    email: String,
    password1: String,
    password2: String
}


#[get("/login")]
async fn login_page(request: HttpRequest) -> Result<impl Responder> {
    if request.query_string() == "dev" {
        Ok(NamedFile::open("../.templates/login.html")?)
    } else {
        Ok(NamedFile::open("../dist/.templates/login.html")?)
    }
}

#[post("/login")]
async fn login(
    request: HttpRequest,
    login_form: web::Form<LoginForm>,
    user_store_addr: web::Data<Recipient<GetUserMessage>>,
    argon: web::Data<Argon2<'_>>
) -> Result<impl Responder> {
    let user = user_store_addr.send(GetUserMessage {
        username_email: login_form.username_email.clone()
    })
        .await
        .map_err(|_| error::ErrorInternalServerError("Failed to login, try again later"))??;

    if let Some(user) = user {
    
        let parsed_hash = PasswordHash::new(&user.password_hash)
            .map_err(|_| error::ErrorInternalServerError("Failed to login, try again later"))?;

        let password_check = argon.verify_password(login_form.password.as_bytes(), &parsed_hash);
        
        if password_check.is_ok() {

            let jwt_token = authentication::generate_jwt_token(user.id.clone())?;
            let is_dev = request.query_string() == "dev";

            return Ok(
                HttpResponse::Found()
                    .cookie(
                        Cookie::build(AUTH_COOKIE_NAME, jwt_token)
                            .same_site(actix_web::cookie::SameSite::Lax) // prevents CSRF for POST requests
                            .http_only(true) // prevents some XSS attacks
                            .path("/")
                            .finish()
                    )
                    .append_header((header::LOCATION, if is_dev { "/home?dev" } else { "/home" })) // manual redirect
                    .finish()
            )
        }
    
        Ok(HttpResponse::Forbidden().body("Invalid password or username"))
    } else {
        Ok(HttpResponse::BadRequest().body("User does not exist"))
    }
}

#[get("/register")]
async fn register_page(request: HttpRequest) -> Result<impl Responder> {
    if request.query_string() == "dev" {
        Ok(NamedFile::open("../.templates/register.html")?)
    } else {
        Ok(NamedFile::open("../dist/.templates/register.html")?)
    }
}

#[post("/register")]
async fn register(
    request: HttpRequest,
    register_form: web::Form<RegisterForm>,
    user_store_addr: web::Data<Recipient<RegisterUserMessage>>,
    argon: web::Data<Argon2<'_>>
) -> Result<impl Responder> {

    if register_form.password1 != register_form.password2 {
        return Ok(HttpResponse::BadRequest().body("Passwords do not match"));
    }

    let salt = SaltString::generate(&mut OsRng);

    // Hash password to PHC string ($argon2id$v=19$...)
    let password_hash = 
        argon
            .hash_password(
                register_form.password1.clone().as_bytes(), &salt
            )
            .map_err(|_| error::ErrorInternalServerError("Registration Failed"))?
            .to_string();

    let _ = user_store_addr.send(RegisterUserMessage {
        user: RegisterUser {
            email: register_form.email.clone(),
            username: register_form.username.clone(),
            password_hash: password_hash.clone()
        }
    })
        .await
        .map_err(|_| error::ErrorInternalServerError("Failed to register, try again later"))??;
    // TODO: better error handling if user already exists

    let is_dev = request.query_string() == "dev";

    Ok(
        HttpResponse::Found()
            .append_header((header::LOCATION, if is_dev { "/user/login?dev" } else { "/user/login" } )) // manual redirect
            .finish()
    )
}

#[post("/edit")]
async fn edit(register_form: web::Form<RegisterForm>) -> impl Responder {

    if register_form.password1 != register_form.password2 {
        return HttpResponse::BadRequest().body("Passwords do not match");
    }

    HttpResponse::Ok().body(register_form.username.clone())
}

pub fn user_service(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/user")
            .service(login)
            .service(login_page)
            .service(register)
            .service(register_page)
            .service(edit)
    );
}
