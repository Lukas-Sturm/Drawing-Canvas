use actix_files::NamedFile;
use actix_web::{http::header, HttpRequest, HttpResponse, HttpResponseBuilder, Result};

// in dev mode vite handles module loading on the fly, requests will include /src/ files
#[cfg(feature = "dev")]
pub static INDEX_FILE: &str = "../index.html";
// in prod mode the dist folder is served, vite bundles all modules in /dist/ html requests /dist/ "compiled" js
#[cfg(not(feature = "dev"))]
pub static INDEX_FILE: &str = "../dist/index.html";

#[cfg(feature = "dev")]
pub static TEMPLATES_DIR: &str = "../.templates/";
#[cfg(not(feature = "dev"))]
pub static TEMPLATES_DIR: &str = "../dist/.templates/";

pub async fn serve_index(_: &HttpRequest) -> Result<NamedFile> {
    // println!("Serving index from: {}", INDEX_FILE);
    Ok(NamedFile::open_async(INDEX_FILE).await?)
}

pub async fn serve_template(template: &str, _: &HttpRequest) -> Result<NamedFile> {
    // println!(
    //     "Serving template from: {}",
    //     TEMPLATES_DIR.to_owned() + template
    // );
    Ok(NamedFile::open_async(TEMPLATES_DIR.to_owned() + template).await?)
}

pub fn builder_redirect_to_static(route_name: &str, req: &HttpRequest) -> HttpResponseBuilder {
    // TODO: also copy the query string and implement some kind of redirect after login logic
    // TODO: add error handling
    let url = req
        .url_for_static(route_name)
        .expect("Failed to generate route url");

    HttpResponse::Found()
        .append_header((header::LOCATION, url.path())) // manual redirect
        .take()
}

pub fn builder_redirect<U, I>(
    route_name: &str,
    req: &HttpRequest,
    elements: U,
) -> HttpResponseBuilder
where
    U: IntoIterator<Item = I>,
    I: AsRef<str>,
{
    let url = req
        .url_for(route_name, elements)
        .expect("Failed to generate route url");

    HttpResponse::Found()
        .append_header((header::LOCATION, url.path())) // manual redirect
        .take()
}

pub fn redirect_to<U, I>(route_name: &str, req: &HttpRequest, elements: U) -> HttpResponse
where
    U: IntoIterator<Item = I>,
    I: AsRef<str>,
{
    builder_redirect(route_name, req, elements).finish()
}

pub fn redirect_to_static(route_name: &str, req: &HttpRequest) -> HttpResponse {
    builder_redirect_to_static(route_name, req).finish()
}
