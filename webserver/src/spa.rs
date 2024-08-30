use actix_web::{
    body::EitherBody,
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform, Url},
    Error,
};
use futures_util::{future::LocalBoxFuture, FutureExt, TryFutureExt};
use regex::Regex;
use std::future::{ready, Ready};
use crate::canvas::store;

pub struct SPAService;

impl<S, B> Transform<S, ServiceRequest> for SPAService
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Transform = SPAMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        let regex = Regex::new(
            format!("^/ws/canvas/[{}]{{{}}}/?$", 
                store::CANVAS_ID_ALPHABET_STR,
                store::CANVAS_ID_LENGTH
            ).as_str()
        ).expect("Failed to generate canvas Websocket Regex");
        
        ready(Ok(SPAMiddleware { 
            service,
            regex 
        }))
    }
}

pub struct SPAMiddleware<S> {
    service: S,
    regex: Regex
}

impl<S, B> Service<ServiceRequest> for SPAMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, mut req: ServiceRequest) -> Self::Future {
        // TODO: check how this works with Query Strings
        if req.path().starts_with("/assets") {
            println!("Request {:?} for assets, forwarding", req.uri());
            return self
                .service
                .call(req)
                .map_ok(ServiceResponse::map_into_left_body)
                .boxed_local();
        }

        if self.regex.is_match(req.path()) {
            println!("Request {:?} for websocket, forwarding", req.uri());
            return self
                .service
                .call(req)
                .map_ok(ServiceResponse::map_into_left_body)
                .boxed_local();
        }

        // request not send from js, internal redirect to /
        if !req.path().eq("/") && !req.headers().contains_key("X-SPA-Request") {
            println!("Not SPA Request {:?}, Internal redirect to /", req.uri());
            // Not 100% sure if this is the correct way to update the request uri
            // Works for this demo application, but might not be the best way, would ask actix-web devs for prod
            let new_url = Url::new("/".parse().unwrap());
            req.match_info_mut().get_mut().update(new_url.uri());
            req.head_mut().uri = new_url.uri().clone();
        }

        self.service
            .call(req)
            .map_ok(ServiceResponse::map_into_left_body)
            .boxed_local()
    }
}
