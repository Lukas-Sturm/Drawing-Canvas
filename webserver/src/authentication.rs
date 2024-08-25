use crate::canvas::store::CanvasClaim;
use crate::canvas::store::GetUserClaimsMessage;
use crate::templates;
use crate::user;
use actix::Recipient;
use actix_web::body::BoxBody;
use actix_web::body::EitherBody;
use actix_web::cookie::Cookie;
use actix_web::dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::error;
use actix_web::web;
use actix_web::Error;
use actix_web::HttpMessage;
use futures_util::future::LocalBoxFuture;
use futures_util::{FutureExt, TryFutureExt};
use serde::{Deserialize, Serialize};
use std::future::{ready, Ready};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JWTClaims {
    pub uid: String,
    pub can: Vec<CanvasClaim>,
    pub exp: usize,
    pub rfr: String,
}

pub struct RefreshClaims {
    /// User ID ? not sure if needed here
    uid: String,
    /// Client IP
    ip: String,
    /// User-Agent
    agt: String,
    exp: usize,
}

pub struct ClientIdentifier {
    /// hashed ip + use salt to prevent rainbow table attacks
    ip: String,
    /// hashed user-agent + salt to prevent rainbow table attacks
    agent: String,
}

pub fn generate_jwt_token(user_id: String, canvas_claims: Vec<CanvasClaim>) -> Result<String, std::io::Error> {

    // Problem: claims are not stored in the token
    // if the claims change, the token is still valid and won't be invalidated
    // Solution: short expiration time and refresh token
    // NOTE: this is a bad solution but JWT is not realy meant to store session data, but it is required by the exercise

    let claims = JWTClaims {
        uid: user_id,
        can: canvas_claims,
        exp: chrono::Utc::now().timestamp() as usize + 15, // valid for 15 seconds
        rfr: "refresh".to_string(),
    };

    jsonwebtoken::encode(
        &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(user::JWT_SECRET.as_bytes()),
    )
    .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "Failed to generate Token"))
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
    service: S,
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

        let mut validation_rules = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256);
        validation_rules.validate_exp = false; // disable expiration check, we will check it manually

        if let Some(cookie) = cookie {
            // jsonwebtoken library not suseptible to algorithm substitution attacks, no need to check alg: none
            let jwt_decode = jsonwebtoken::decode::<JWTClaims>(
                cookie.value(),
                &jsonwebtoken::DecodingKey::from_secret(user::JWT_SECRET.as_bytes()),
                &validation_rules,
            );

            match jwt_decode {
                Ok(token) => {

                    // add claims to request extensions
                    req.extensions_mut().insert(token.claims.clone());

                    if token.claims.exp < chrono::Utc::now().timestamp() as usize {
                        println!("Token expired");

                        if token.claims.rfr == "refresh" {
                            println!("Refreshing allowed");

                            // Explanation: This calles the next middleware in the chain
                            // then receives the response. This is a future, we can then attach a future to be executed after the response is generated
                            // then we are able to call another actor and wait its message
                            // TODO: maybe ask on discord if this is "idiomatic" actix-web/async-rust
                            self.service
                                .call(req)
                                .and_then(| mut res | async move {

                                    let canvas_store = res.request().app_data::<web::Data<Recipient<GetUserClaimsMessage>>>();

                                    if let Some(canvas_store) = canvas_store {
                                        let claims = canvas_store.send(GetUserClaimsMessage {
                                            user_id: token.claims.uid.clone(),
                                        }).await.map_err(|_| error::ErrorInternalServerError("Failed to refresh token"))?;
                                        // TODO: consider logging alterting system, if this error occurs, something is very wrong 
                                        
                                        let refreshed_token = generate_jwt_token(token.claims.uid.clone(), claims).map_err(|_| error::ErrorInternalServerError("Failed to refresh token"))?;
                                        // TODO: consider logging alterting system, if this error occurs, something is wrong

                                        res.response_mut().add_cookie(
                                            &Cookie::build(user::AUTH_COOKIE_NAME, refreshed_token)
                                                .same_site(actix_web::cookie::SameSite::Lax)
                                                .http_only(true)
                                                .path("/")
                                                .finish()
                                        )?;
                                        // TODO: consider logging alterting system, if this error occurs, something is wrong
                                        Ok(res)
                                    } else {
                                        Err(error::ErrorInternalServerError("Failed to refresh token"))
                                    }
                                })
                                .map_ok(ServiceResponse::map_into_left_body::<BoxBody>)
                                .boxed_local()
                        } else {
                            println!("Refresh not allowed");

                            Box::pin(async {
                                let redirect_response = templates::redirect_to_static("login", req.request());
                                Ok(req.into_response(redirect_response.map_into_right_body()))
                            })
                        }
                    } else {
                        println!("Valid Token: {:?}", token.claims);
    
                        // TODO: consider recreating token if request requests it. skips waiting time for refreshtoken
                        self.service
                            .call(req)
                            .map_ok(ServiceResponse::map_into_left_body)
                            .boxed_local()
                    }
                }
                Err(e) => {
                    println!("Failed to decode token or invalid token: {:?}", e);
                    Box::pin(async {
                        let redirect_response = templates::redirect_to_static("login", req.request());
                        Ok(req.into_response(redirect_response.map_into_right_body()))
                    })
                }
            }
        } else {
            println!("No auth cookie found");

            Box::pin(async {
                let redirect_response = templates::redirect_to_static("login", req.request());
                Ok(req.into_response(redirect_response.map_into_right_body()))
            })
        }
    }
}
