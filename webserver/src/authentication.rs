use std::future::{ready, Ready};
use actix_web::dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::{Error, HttpResponse};
use actix_web::body::EitherBody;
use actix_web::http::header;
use futures_util::future::LocalBoxFuture;
use futures_util::{FutureExt, TryFutureExt};
use serde::{Deserialize, Serialize};
use crate::user;

#[derive(Serialize, Deserialize, Debug)]
pub struct JWTClaims {
    uid: String,
    can: Vec<CanvasClaim>,
    exp: usize
}

#[derive(Serialize, Deserialize, Debug)]
#[repr(u8)]
enum AccessRight {
    Read = b'R',
    Write = b'W',
    Moderate = b'M',
    Owner = b'O',
    Voice = b'V'
}

#[derive(Serialize, Deserialize, Debug)]
struct CanvasClaim {
    c: String,
    r: AccessRight
}

pub fn generate_jwt_token(user_id: String) -> Result<String, std::io::Error> {
    let claims = JWTClaims {
        uid: user_id,
        can: vec![CanvasClaim {c: "canvas".to_string(), r: AccessRight::Owner }],
        exp: chrono::Utc::now().timestamp() as usize + 60 * 60 // valid for 60 minutes
    };

    jsonwebtoken::encode(
        &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(user::JWT_SECRET.as_bytes())
    ).map_err(| _ | std::io::Error::new(std::io::ErrorKind::Other, "Failed to generate Token"))
}


pub struct AuthenticationService;

impl<S, B> Transform<S, ServiceRequest> for AuthenticationService
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Transform = AuthenticationMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuthenticationMiddleware { service }))
    }
}

pub struct AuthenticationMiddleware<S> {
    service: S
}

impl<S, B> Service<ServiceRequest> for AuthenticationMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        // let user_store: &web::Data<Addr<UserStore>> = req.app_data().expect("UserStore not found");
        let cookie = req.cookie(user::AUTH_COOKIE_NAME);

        if let Some(cookie) = cookie {

            // jsonwebtoken library not suseptible to algorithm substitution attacks
            let jwt_decode = jsonwebtoken::decode::<JWTClaims>(
                cookie.value(),
                &jsonwebtoken::DecodingKey::from_secret(user::JWT_SECRET.as_bytes()),
                &jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256)
            );

            if let Ok(token) = jwt_decode {
                println!("Token: {:?}", token.claims);
            } else {
                println!("Failed to decode token or invalid token");
                return Box::pin(async {
                    Ok(redirect_to_login(req))
                })
            }

            // todo: check if access rights have changed
            // todo: use refresh token
            // todo: check if refresh token is still valid
        } else {
            println!("No auth cookie found");

            return Box::pin(async {
                Ok(redirect_to_login(req))
            })
        }

        self.service.call(req).map_ok(ServiceResponse::map_into_left_body).boxed_local()
    }
}

fn redirect_to_login<B>(req: ServiceRequest) -> ServiceResponse<EitherBody<B>> {
    let is_dev = req.query_string() == "dev";

    req.into_response(
        HttpResponse::Found()
            .append_header((header::LOCATION, if is_dev { "/user/login?dev" } else { "/user/login" })) // manual redirect
            .finish()
            .map_into_right_body()
    )
}
