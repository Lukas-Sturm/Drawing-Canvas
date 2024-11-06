use actix_web::{
    error::{self},
    http::header::ContentType,
    HttpResponse,
};
use derive_more::{Display, Error};

#[derive(Debug, Display, Error)]
pub enum CanvasStoreError {
    #[display("Canvas nicht gefunden")]
    CanvasNotFound,
    // #[display("User not found")]
    // UserNotFound,
    #[display("Zugriff verweigert: {}", _0)]
    AccessDenied(#[error(ignore)] String),
    #[display("Daten konnten nicht gespeichert werden")]
    PersistenceFailed,
}

impl error::ResponseError for CanvasStoreError {
    fn error_response(&self) -> actix_web::HttpResponse<actix_web::body::BoxBody> {
        HttpResponse::build(self.status_code())
            .insert_header(ContentType::html())
            .body(self.to_string())
    }

    fn status_code(&self) -> actix_web::http::StatusCode {
        match *self {
            CanvasStoreError::CanvasNotFound => actix_web::http::StatusCode::NOT_FOUND,
            // CanvasStoreError::UserNotFound => actix_web::http::StatusCode::NOT_FOUND,
            CanvasStoreError::AccessDenied(_) => actix_web::http::StatusCode::FORBIDDEN,
            CanvasStoreError::PersistenceFailed => {
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }
}
