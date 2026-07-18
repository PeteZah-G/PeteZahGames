use axum::{
    body::Body,
    extract::{ws::WebSocketUpgrade, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use bytes::Bytes;
use futures::StreamExt;
use std::sync::Arc;
use std::time::Duration;
use tokio::fs::{self, File};
use tokio::io::{AsyncWriteExt, BufWriter};
use tokio::sync::{broadcast, mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tracing::{debug, error, warn};
use url::Url;
use crate::cache::{get_cache_path, load_from_disk, write_to_disk};
use crate::constants;
use crate::cover::handle_cover_request;
use crate::encoding::decode_mochi_url;
use crate::helpers::{
    fix_game_content_type, get_cdn_cache_control, is_blacklisted_header, is_blacklisted_res_header,
    is_likely_static_asset_fast,
};
use crate::rewrite::{rewrite_css_urls, rewrite_html};
use crate::state::{AppState, CachedResponse};
use crate::websocket::handle_socket;

static UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
static SEC_CH_UA: &str = "\"Not-A.Brand\";v=\"99\", \"Chromium\";v=\"124\", \"Google Chrome\";v=\"124\"";

fn build_safe_response_headers(res_headers_ref: &HeaderMap, is_likely_asset: bool) -> HeaderMap {
    let mut safe_headers = HeaderMap::with_capacity(res_headers_ref.len());
    for (k, v) in res_headers_ref.iter() {
        let key_str = k.as_str();
        if !is_blacklisted_res_header(key_str) {
            if key_str == "set-cookie" {
                let cookie_str = v.to_str().unwrap_or("");
                let safe_cookie = cookie_str
                    .replace("Domain=", "NoDomain=")
                    .replace("Secure", "")
                    .replace("SameSite=Strict", "SameSite=Lax");
                safe_headers.append(k, HeaderValue::from_str(&safe_cookie).unwrap_or(v.clone()));
            } else {
                safe_headers.insert(k, v.clone());
            }
        }
    }
    if is_likely_asset {
        if let Some(enc) = res_headers_ref.get("content-encoding") {
            safe_headers.insert("content-encoding", enc.clone());
        }
    }
    safe_headers
}

fn apply_common_request_headers(
    mut req_builder: reqwest::RequestBuilder,
    headers: &HeaderMap,
    target_url: &Url,
    is_likely_asset: bool,
    is_html_page: bool,
) -> reqwest::RequestBuilder {
    for (k, v) in headers.iter() {
        let key_str = k.as_str();
        if !is_blacklisted_header(key_str)
            && !key_str.starts_with("cf-")
            && !key_str.starts_with("x-")
        {
            if !is_likely_asset && key_str == "accept-encoding" {
                continue;
            }
            req_builder = req_builder.header(k, v);
        }
    }
    req_builder = req_builder.header("User-Agent", UA);
    req_builder = req_builder.header("Sec-Ch-Ua", SEC_CH_UA);
    req_builder = req_builder.header("Sec-Ch-Ua-Mobile", "?0");
    req_builder = req_builder.header("Sec-Ch-Ua-Platform", "\"Windows\"");
    req_builder = req_builder.header("Accept-Language", "en-US,en;q=0.9");

    if is_html_page {
        req_builder = req_builder.header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8");
        req_builder = req_builder.header("Sec-Fetch-Site", "cross-site");
        req_builder = req_builder.header("Sec-Fetch-Mode", "navigate");
        req_builder = req_builder.header("Sec-Fetch-Dest", "document");
        req_builder = req_builder.header("Sec-Fetch-User", "?1");
        req_builder = req_builder.header("Upgrade-Insecure-Requests", "1");
    } else {
        req_builder = req_builder.header("Sec-Fetch-Site", "same-origin");
        req_builder = req_builder.header("Sec-Fetch-Mode", "cors");
        req_builder = req_builder.header("Sec-Fetch-Dest", "empty");
        req_builder = req_builder.header("Priority", "u=1, i");
    }

    let origin = target_url.origin().ascii_serialization();
    req_builder = req_builder.header("Referer", format!("{}/", origin));
    req_builder = req_builder.header("Origin", origin);
    req_builder
}

pub async fn proxy_handler(
    State(state): State<Arc<AppState>>,
    method: Method,
    headers: HeaderMap,
    uri: Uri,
    ws: Option<WebSocketUpgrade>,
    req_body: Bytes,
) -> Response {
    let mut valid_token: Option<String> = None;
    let original_uri = uri.path_and_query().map(|p| p.as_str()).unwrap_or("");
    let path_and_query = uri.path_and_query().map(|p| p.as_str()).unwrap_or("");
    let is_cover_request = path_and_query.contains(constants::COVER_PREFIX);
    let prefix = if is_cover_request {
        constants::COVER_PREFIX
    } else {
        constants::MOCHI_PREFIX
    };
    let prefix_pos = path_and_query.find(prefix).unwrap_or(0);
    let raw_target = &path_and_query[prefix_pos + prefix.len()..];
    let decoded_target_owned = if !raw_target.starts_with("http")
        && !raw_target.starts_with("ws")
        && !raw_target.is_empty()
    {
        let clean = raw_target.trim_end_matches('/');
        let (token, mut remainder) = clean.split_once('/').unwrap_or((clean, ""));

        if remainder.starts_with("!a!") {
            remainder = remainder.trim_start_matches("!a!");
        }

        if let Some(decoded_base) = decode_mochi_url(token) {
            valid_token = Some(token.to_string());

            if remainder.is_empty() {
                decoded_base
            } else {
                let mut base_for_join = decoded_base.clone();
                if !base_for_join.ends_with('/')
                    && !base_for_join.split('?').next().unwrap_or("").split('/').last().unwrap_or("").contains('.')
                {
                    base_for_join.push('/');
                }

                match url::Url::parse(&base_for_join) {
                    Ok(base) => base
                        .join(remainder)
                        .map(|u| u.to_string())
                        .unwrap_or_else(|_| {
                            format!("{}/{}", base_for_join.trim_end_matches('/'), remainder)
                        }),
                    Err(_) => {
                        format!("{}/{}", base_for_join.trim_end_matches('/'), remainder)
                    }
                }
            }
        } else {
            let mut fallback_target = raw_target.to_string();

            if let Some(referer) = headers.get("referer").and_then(|v| v.to_str().ok()) {
                if let Some(referer_target) = referer.split(prefix).nth(1) {
                    let referer_clean = referer_target.trim_end_matches('/');
                    let (ref_token, _) =
                        referer_clean.split_once('/').unwrap_or((referer_clean, ""));
                    if let Some(ref_decoded_base) = decode_mochi_url(ref_token) {
                        if let Ok(ref_url) = url::Url::parse(&ref_decoded_base) {
                            if let Ok(resolved) = ref_url.join(original_uri) {
                                fallback_target = resolved.to_string();
                            }
                        }
                    }
                }
            }

            if fallback_target == raw_target {
                if let Some(cookie_hdr) = headers.get("cookie").and_then(|c| c.to_str().ok()) {
                    for cookie in cookie_hdr.split(';') {
                        let cookie = cookie.trim();
                        if let Some(base_token) = cookie.strip_prefix("mochi_base=") {
                            if let Some(ref_decoded_base) = decode_mochi_url(base_token) {
                                if let Ok(ref_url) = Url::parse(&ref_decoded_base) {
                                    if let Ok(resolved) = ref_url.join(original_uri) {
                                        fallback_target = resolved.to_string();
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            fallback_target
        }
    } else {
        raw_target.to_string()
    };
    let target_url_str: &str = &decoded_target_owned;
    debug!("proxying request to: {}", target_url_str);

    if let Some(ws) = ws {
        if target_url_str.starts_with("ws/") || headers.contains_key("upgrade") {
            let real_target = if target_url_str.starts_with("ws/") {
                let remaining = &target_url_str[3..];
                if remaining.starts_with("http") {
                    remaining.replace("http://", "ws://").replace("https://", "wss://")
                } else if remaining.starts_with("wss://") {
                    remaining.to_string()
                } else {
                    let decoded = urlencoding::decode(remaining)
                        .unwrap_or(std::borrow::Cow::Borrowed(remaining));
                    if decoded.starts_with("wss://") {
                        decoded.into_owned()
                    } else if decoded.starts_with("ws://") {
                        decoded.into_owned()
                    } else {
                        target_url_str
                            .replace("ws/", "https://")
                            .replace("http://", "ws://")
                            .replace("https://", "wss://")
                    }
                }
            } else {
                if target_url_str.starts_with("http") {
                    target_url_str.replace("http://", "ws://").replace("https://", "wss://")
                } else {
                    format!("wss://{}", target_url_str)
                }
            };
            let mut protocols = Vec::new();
            if let Some(p) = headers.get("sec-websocket-protocol") {
                if let Ok(s) = p.to_str() {
                    protocols = s.split(',').map(|x| x.trim().to_string()).collect();
                }
            }
            let ws = if !protocols.is_empty() {
                ws.protocols(protocols)
            } else {
                ws
            };

            let headers_clone = headers.clone();
            return ws.on_upgrade(move |socket| handle_socket(socket, real_target, headers_clone));
        }
    }

    if method == Method::GET {
        if let Some(cached) = state.cache.get(target_url_str).await {
            let mut res_headers = cached.headers.clone();
            res_headers.insert("X-Cache", HeaderValue::from_static("HIT"));

            if let Some(etag) = res_headers.get("etag").cloned() {
                if let Some(inm) = headers.get("if-none-match") {
                    if etag == *inm {
                        return (StatusCode::NOT_MODIFIED, res_headers).into_response();
                    }
                }
            }

            fix_game_content_type(target_url_str, &mut res_headers);
            let status = StatusCode::from_u16(cached.status).unwrap_or(StatusCode::OK);
            return (status, res_headers, cached.body.clone()).into_response();
        }
    }

    let target_url_string = if !target_url_str.starts_with("http") {
        format!("https://{}", target_url_str)
    } else {
        target_url_str.to_string()
    };

    let _is_blocked_asset = target_url_string.contains(".part")
        || target_url_string.contains(".wasm")
        || target_url_string.contains(".data")
        || target_url_string.contains(".mem");

    if state.blocklist_matcher.is_match(&target_url_string) {
        let mut headers = HeaderMap::new();
        headers.insert(
            "Content-Type",
            HeaderValue::from_static("application/javascript"),
        );
        return (StatusCode::OK, headers, "/* no */").into_response();
    }

    let target_url = match Url::parse(&target_url_string) {
        Ok(u) => u,
        Err(_) => return (StatusCode::BAD_REQUEST, "invalid url").into_response(),
    };

    let is_likely_asset =
        is_likely_static_asset_fast(&target_url_string, Some(&state.asset_ext_matcher));

    if method == Method::GET && is_cover_request {
        return handle_cover_request(
            &state,
            &target_url,
            &target_url_string,
            target_url_str,
            &method,
            &headers,
        )
        .await
        .unwrap_or_else(|e| e);
    }

    if method == Method::GET && is_likely_asset {
        return fetch_and_cache(
            &state,
            &target_url,
            &target_url_string,
            target_url_str,
            &method,
            &headers,
            &req_body,
            is_likely_asset,
        )
        .await
        .unwrap_or_else(|e| e);
    }

    let client = if is_likely_asset {
        &state.asset_client
    } else {
        &state.html_client
    };

    let mut req_builder = client.request(method.clone(), target_url.clone());

    let looks_like_html_page =
        target_url_string.ends_with(".html") || target_url_string.ends_with(".htm");
    req_builder = apply_common_request_headers(
        req_builder,
        &headers,
        &target_url,
        is_likely_asset,
        looks_like_html_page,
    );

    if !req_body.is_empty() {
        req_builder = req_builder.body(req_body);
    }

    if let Some(host) = target_url.host_str() {
        req_builder = req_builder.header("host", host);
        let origin = format!("{}://{}", target_url.scheme(), host);
        req_builder = req_builder.header("origin", origin);
        req_builder = req_builder.header("referer", target_url.as_str());
    }

    let upstream_res = match req_builder.send().await {
        Ok(res) => res,
        Err(e) => {
            if e.is_connect() || e.is_request() {
                let retry_builder = client
                    .request(method.clone(), target_url.clone())
                    .header("User-Agent", UA)
                    .header("Accept", "text/css,*/*;q=0.1")
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .header(
                        "Origin",
                        target_url.origin().ascii_serialization(),
                    )
                    .header(
                        "Referer",
                        format!("{}/", target_url.origin().ascii_serialization()),
                    );
                match retry_builder.send().await {
                    Ok(res) => res,
                    Err(e2) => {
                        return (StatusCode::BAD_GATEWAY, format!("upstream error: {}", e2))
                            .into_response();
                    }
                }
            } else {
                return (StatusCode::BAD_GATEWAY, format!("upstream error: {}", e)).into_response();
            }
        }
    };

    let status = upstream_res.status();
    debug!("upstream response status: {} for {}", status, target_url);

    if status.is_redirection() {
        return (StatusCode::BAD_GATEWAY, "too many redirects").into_response();
    }

    if !status.is_success() {
        let mut error_headers = HeaderMap::new();
        if let Some(ct) = upstream_res.headers().get("content-type") {
            error_headers.insert("content-type", ct.clone());
        } else {
            error_headers.insert(
                "content-type",
                HeaderValue::from_static("text/html; charset=utf-8"),
            );
        }

        let bytes = upstream_res.bytes().await.unwrap_or_default();
        let error_body = String::from_utf8_lossy(&bytes);
        error!("upstream error body for {}: {}", target_url, error_body);

        return (status, error_headers, error_body.to_string()).into_response();
    }

    let res_headers_ref = upstream_res.headers();

    let mut safe_headers = build_safe_response_headers(res_headers_ref, is_likely_asset);

    fix_game_content_type(&target_url_string, &mut safe_headers);
    safe_headers.insert("Access-Control-Allow-Origin", HeaderValue::from_static("*"));
    safe_headers.insert("Cross-Origin-Opener-Policy", HeaderValue::from_static("same-origin"));
    safe_headers.insert("Cross-Origin-Embedder-Policy", HeaderValue::from_static("require-corp"));
    safe_headers.insert("Cross-Origin-Resource-Policy", HeaderValue::from_static("cross-origin"));
    safe_headers.insert("X-Cache", HeaderValue::from_static("MISS"));

    let content_type = safe_headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    let content_type_lower = content_type.to_ascii_lowercase();
    let is_html = (content_type_lower.contains("text/html")
        || (content_type == "application/octet-stream"
            && (target_url_str.ends_with(".html") || target_url_str.ends_with(".htm")))
        || (content_type == "text/plain"
            && (target_url_str.ends_with(".html") || target_url_str.ends_with(".htm"))))
        && !target_url_str.ends_with(".swf")
        && !target_url_str.ends_with(".wasm");

    if is_html && status.is_success() && !is_likely_asset && method == Method::GET {
        safe_headers.remove("content-length");
        safe_headers.remove("content-encoding");

        if let Some(token) = &valid_token {
            let cookie_val = format!("mochi_base={}; Path=/; SameSite=Lax", token);
            safe_headers.append("set-cookie", HeaderValue::from_str(&cookie_val).unwrap());
        }

        let force_refresh = headers
            .get("cache-control")
            .and_then(|h| h.to_str().ok())
            .map(|v| v.contains("no-cache"))
            .unwrap_or(false);

        let html_permit = match tokio::time::timeout(
            Duration::from_secs(5),
            state.html_rewrite_permit.clone().acquire_owned(),
        )
        .await
        {
            Ok(Ok(permit)) => permit,
            _ => {
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "server busy, try again later",
                )
                    .into_response();
            }
        };

        let effective_url = upstream_res.url().clone();

        let full_body = match upstream_res.bytes().await {
            Ok(b) => b,
            Err(_) => {
                return (StatusCode::BAD_GATEWAY, "failed to read upstream body").into_response()
            }
        };

        let effective_url_clone = effective_url.clone();

        let body_vec = tokio::task::spawn_blocking(move || {
            let _permit = html_permit;
            let base_url_str = effective_url_clone.to_string();
            rewrite_html(&full_body, &effective_url_clone, &base_url_str)
        })
        .await
        .unwrap_or_default();

        let body_bytes = Bytes::from(body_vec);

        if !force_refresh
            && !body_bytes.is_empty()
            && body_bytes.len() <= state.max_cache_entry_size
        {
            let status_u16 = status.as_u16();
            let cache_key = target_url_str.to_string();
            let safe_headers_for_cache = safe_headers.clone();
            let cached_body = body_bytes.clone();

            let cached = Arc::new(CachedResponse {
                status: status_u16,
                headers: safe_headers_for_cache,
                body: cached_body.clone(),
            });

            state.cache.insert(cache_key.clone(), cached.clone()).await;

            let headers_for_disk = safe_headers.clone();
            let body_for_disk = cached_body;
            tokio::spawn(async move {
                write_to_disk(&cache_key, status_u16, &headers_for_disk, &body_for_disk).await;
            });
        }

        return (status, safe_headers, Body::from(body_bytes)).into_response();
    }

    let is_image = content_type.starts_with("image/");
    let is_json = content_type.contains("json");
    let is_favicon_heuristic = target_url_str.contains("favicons?");
    let is_css = content_type.contains("text/css");
    let is_js = content_type.contains("javascript");
    let is_font = content_type.starts_with("font/") || content_type.contains("font");
    let is_wasm = content_type.contains("wasm");
    let should_cache = (is_likely_asset
        || is_image
        || is_json
        || is_favicon_heuristic
        || is_css
        || is_js
        || is_font
        || is_wasm)
        && status == StatusCode::OK
        && method == Method::GET
        && !headers.contains_key("upgrade")
        && !headers.contains_key("range");

    if is_css && status.is_success() && method == Method::GET {
        safe_headers.remove("content-length");
        let full_body = match upstream_res.bytes().await {
            Ok(b) => b,
            Err(_) => {
                return (StatusCode::BAD_GATEWAY, "failed to read upstream css body")
                    .into_response()
            }
        };
        let css_str = String::from_utf8_lossy(&full_body);
        let rewritten_css = rewrite_css_urls(&css_str, &target_url);
        let rewritten_bytes = Bytes::from(rewritten_css.into_bytes());

        if !should_cache {
            safe_headers.insert(
                "Cache-Control",
                HeaderValue::from_static(get_cdn_cache_control(&target_url_string)),
            );
        } else {
            let cc = get_cdn_cache_control(&target_url_string);
            safe_headers.insert("Cache-Control", HeaderValue::from_static(cc));
        }

        if rewritten_bytes.len() <= state.max_cache_entry_size {
            let cached = Arc::new(CachedResponse {
                status: status.as_u16(),
                headers: safe_headers.clone(),
                body: rewritten_bytes.clone(),
            });
            state.cache.insert(target_url_str.to_string(), cached).await;
        }

        return (status, safe_headers, Body::from(rewritten_bytes)).into_response();
    }

    if should_cache {
        let (sender_tx, sender_rx) =
            mpsc::channel::<Result<Bytes, std::io::Error>>(state.channel_buffer);
        let target_url_str_owned = target_url_str.to_string();
        let max_entry = state.max_cache_entry_size;
        let state_clone = state.clone();
        let safe_headers_clone = safe_headers.clone();
        let status_u16 = status.as_u16();
        let cc = get_cdn_cache_control(&target_url_string);
        safe_headers.insert("Cache-Control", HeaderValue::from_static(cc));

        tokio::spawn(async move {
            let mut stream = upstream_res.bytes_stream();
            let mut accumulator = Vec::new();
            let mut total_size = 0usize;
            let mut aborted = false;

            while let Some(item) = stream.next().await {
                match item {
                    Ok(chunk) => {
                        total_size += chunk.len();
                        if total_size < max_entry {
                            accumulator.extend_from_slice(&chunk);
                        }
                        if sender_tx
                            .send_timeout(Ok(chunk), Duration::from_secs(10))
                            .await
                            .is_err()
                        {
                            aborted = true;
                            break;
                        }
                    }
                    Err(e) => {
                        let _ = sender_tx
                            .send(Err(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                e.to_string(),
                            )))
                            .await;
                        aborted = true;
                        break;
                    }
                }
            }

            if !aborted {
                if total_size < max_entry && total_size > 0 {
                    let body_bytes = Bytes::from(accumulator);
                    let cached = Arc::new(CachedResponse {
                        status: status_u16,
                        headers: safe_headers_clone,
                        body: body_bytes,
                    });
                    state_clone.cache.insert(target_url_str_owned, cached).await;
                }
            }
        });

        let stream_body = Body::from_stream(ReceiverStream::new(sender_rx));
        return (status, safe_headers, stream_body).into_response();
    }

    let stream = Body::from_stream(upstream_res.bytes_stream());
    (status, safe_headers, stream).into_response()
}

async fn fetch_and_cache(
    state: &Arc<AppState>,
    target_url: &Url,
    _target_url_string: &str,
    target_url_str: &str,
    method: &Method,
    headers: &HeaderMap,
    req_body: &Bytes,
    is_likely_asset: bool,
) -> Result<Response, Response> {
    let force_refresh = headers
        .get("cache-control")
        .and_then(|h| h.to_str().ok())
        .map(|v| v.contains("no-cache"))
        .unwrap_or(false);

    let has_range = headers.contains_key("range");

    if method == &Method::GET && !force_refresh && !has_range {
        if let Some(cached) = state.cache.get(target_url_str).await {
            let mut res_headers = cached.headers.clone();
            res_headers.insert("X-Cache", HeaderValue::from_static("HIT"));
            fix_game_content_type(_target_url_string, &mut res_headers);
            let status = StatusCode::from_u16(cached.status).unwrap_or(StatusCode::OK);
            return Ok((status, res_headers, cached.body.clone()).into_response());
        }
    }

    if method == &Method::GET && !force_refresh && !has_range {
        if let Some(disk_response) = load_from_disk(target_url_str).await {
            debug!("disk cache hit for {}", target_url_str);
            let (mut response, _) = disk_response;
            fix_game_content_type(_target_url_string, response.headers_mut());
            return Ok(response);
        }
    }

    if method == &Method::GET && !has_range {
        if let Some(entry) = state.coalesce.get(target_url_str) {
            let mut rx = entry.subscribe();
            drop(entry);
            debug!("coalescing request for {}", target_url_str);

            match tokio::time::timeout(Duration::from_secs(30), rx.recv()).await {
                Ok(Ok(cached)) => {
                    let mut res_headers = cached.headers.clone();
                    res_headers.insert("X-Cache", HeaderValue::from_static("COALESCED"));
                    fix_game_content_type(_target_url_string, &mut res_headers);
                    let status = StatusCode::from_u16(cached.status).unwrap_or(StatusCode::OK);
                    return Ok((status, res_headers, cached.body.clone()).into_response());
                }
                _ => {
                    debug!(
                        "coalesce wait failed for {}, becoming leader",
                        target_url_str
                    );
                }
            }
        }
    }

    let (coalesce_tx, _) = broadcast::channel::<Arc<CachedResponse>>(1);
    let coalesce_tx_clone = coalesce_tx.clone();
    state
        .coalesce
        .insert(target_url_str.to_string(), coalesce_tx);
    let _permit = match state.request_permit.acquire().await {
        Ok(p) => p,
        Err(_) => {
            state.coalesce.remove(target_url_str);
            return Err((StatusCode::SERVICE_UNAVAILABLE, "too many requests").into_response());
        }
    };

    let client = if is_likely_asset {
        &state.asset_client
    } else {
        &state.html_client
    };

    let mut req_builder = client.request(method.clone(), target_url.clone());
    req_builder = apply_common_request_headers(
        req_builder,
        headers,
        target_url,
        is_likely_asset,
        false,
    );

    if !req_body.is_empty() {
        req_builder = req_builder.body(req_body.clone());
    }

    let upstream_res = match req_builder.send().await {
        Ok(res) => res,
        Err(e) => {
            error!("upstream error for {}: {}", target_url_str, e);
            state.coalesce.remove(target_url_str);
            return Err((StatusCode::BAD_GATEWAY, format!("upstream error: {}", e)).into_response());
        }
    };

    let status = upstream_res.status();

    if status.is_redirection() {
        return Err((StatusCode::BAD_GATEWAY, "too many redirects").into_response());
    }

    let res_headers_ref = upstream_res.headers();

    let mut safe_headers = build_safe_response_headers(res_headers_ref, is_likely_asset);

    if is_likely_asset && status.is_success() {
        let is_unstable = target_url_str.contains("/main/") || target_url_str.contains("/master/");
        let cc_value = if is_unstable {
            "public, max-age=300, stale-while-revalidate=60"
        } else {
            get_cdn_cache_control(_target_url_string)
        };
        safe_headers.insert("Cache-Control", HeaderValue::from_static(cc_value));
    }

    fix_game_content_type(_target_url_string, &mut safe_headers);
    safe_headers.insert("Access-Control-Allow-Origin", HeaderValue::from_static("*"));
    safe_headers.insert("Cross-Origin-Opener-Policy", HeaderValue::from_static("same-origin"));
    safe_headers.insert("Cross-Origin-Embedder-Policy", HeaderValue::from_static("require-corp"));
    safe_headers.insert("Cross-Origin-Resource-Policy", HeaderValue::from_static("cross-origin"));
    safe_headers.insert("X-Cache", HeaderValue::from_static("MISS"));

    let should_cache =
        is_likely_asset && status == StatusCode::OK && method == &Method::GET && !has_range;

    let actually_cache = if should_cache {
        if state.caching_inflight.contains_key(target_url_str) {
            false
        } else {
            state
                .caching_inflight
                .insert(target_url_str.to_string(), ());
            true
        }
    } else {
        false
    };

    if !actually_cache {
        state.coalesce.remove(target_url_str);
    }

    if actually_cache {
        let (sender_tx, sender_rx) =
            mpsc::channel::<Result<Bytes, std::io::Error>>(state.channel_buffer);
        let target_url_str_owned = target_url_str.to_string();
        let ram_limit = state.ram_cache_limit;
        let state_clone = state.clone();
        let safe_headers_clone = safe_headers.clone();

        tokio::spawn(async move {
            let cache_path = get_cache_path(&target_url_str_owned);
            let temp_path = format!("{}.{}.tmp", cache_path, uuid::Uuid::new_v4());

            let mut file = match File::create(&temp_path).await {
                Ok(f) => Some(BufWriter::new(f)),
                Err(e) => {
                    warn!("failed to create temp file {}: {}", temp_path, e);
                    None
                }
            };

            if let Some(ref mut f) = file {
                let status_bytes = status.as_u16().to_le_bytes();
                if f.write_all(&status_bytes).await.is_err() {
                    file = None;
                } else {
                    let header_count = safe_headers_clone.len() as u16;
                    if f.write_all(&header_count.to_le_bytes()).await.is_err() {
                        file = None;
                    } else {
                        for (k, v) in safe_headers_clone.iter() {
                            let k_bytes = k.as_str().as_bytes();
                            let k_len = k_bytes.len() as u16;
                            if f.write_all(&k_len.to_le_bytes()).await.is_err() {
                                file = None;
                                break;
                            }
                            if f.write_all(k_bytes).await.is_err() {
                                file = None;
                                break;
                            }

                            let v_bytes = v.as_bytes();
                            let v_len = v_bytes.len() as u32;
                            if f.write_all(&v_len.to_le_bytes()).await.is_err() {
                                file = None;
                                break;
                            }
                            if f.write_all(v_bytes).await.is_err() {
                                file = None;
                                break;
                            }
                        }
                    }
                }
            }

            let mut stream = upstream_res.bytes_stream();
            let mut accumulator = Vec::new();
            let mut total_size = 0;
            let mut aborted = false;
            let mut is_too_large_for_ram = false;

            while let Some(item) = stream.next().await {
                match item {
                    Ok(chunk) => {
                        let chunk_len = chunk.len();
                        total_size += chunk_len;

                        if let Some(ref mut f) = file {
                            if f.write_all(&chunk).await.is_err() {
                                file = None;
                                let _ = fs::remove_file(&temp_path).await;
                            }
                        }

                        if !is_too_large_for_ram {
                            if total_size < ram_limit {
                                accumulator.extend_from_slice(&chunk);
                            } else {
                                is_too_large_for_ram = true;
                                accumulator.clear();
                            }
                        }

                        if sender_tx
                            .send_timeout(Ok(chunk), Duration::from_secs(10))
                            .await
                            .is_err()
                        {
                            aborted = true;
                            break;
                        }
                    }
                    Err(e) => {
                        let _ = sender_tx
                            .send(Err(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                e.to_string(),
                            )))
                            .await;
                        aborted = true;
                        break;
                    }
                }
            }

            if !aborted {
                if let Some(mut f) = file.take() {
                    let _ = f.flush().await;
                }
                let _ = fs::rename(&temp_path, &cache_path).await;

                if !is_too_large_for_ram && total_size < ram_limit {
                    let body_bytes = Bytes::from(accumulator);
                    let cached = Arc::new(CachedResponse {
                        status: status.as_u16(),
                        headers: safe_headers_clone,
                        body: body_bytes,
                    });
                    state_clone
                        .cache
                        .insert(target_url_str_owned.clone(), cached.clone())
                        .await;
                    let _ = coalesce_tx_clone.send(cached);
                }
            } else {
                let _ = fs::remove_file(&temp_path).await;
            }

            state_clone.caching_inflight.remove(&target_url_str_owned);
            state_clone.coalesce.remove(&target_url_str_owned);
        });

        let stream_body = Body::from_stream(ReceiverStream::new(sender_rx));
        let response = (status, safe_headers, stream_body).into_response();

        return Ok(response);
    }

    let stream = Body::from_stream(upstream_res.bytes_stream());
    let response = (status, safe_headers, stream).into_response();
    Ok(response)
} 