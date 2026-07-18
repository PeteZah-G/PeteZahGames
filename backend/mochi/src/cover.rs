use axum::body::Body;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use futures::StreamExt;
use std::sync::Arc;
use url::Url;
use crate::cache::{load_from_disk, write_to_disk};
use crate::helpers::is_blacklisted_header;
use crate::state::{AppState, CachedResponse};

pub async fn handle_cover_request(
    state: &Arc<AppState>,
    target_url: &Url,
    _target_url_string: &str,
    target_url_str: &str,
    method: &Method,
    headers: &HeaderMap,
) -> Result<Response, Response> {
    if let Some(cached) = state.cache.get(target_url_str).await {
        let mut res_headers = cached.headers.clone();
        res_headers.insert("X-Cache", HeaderValue::from_static("HIT"));
        let status = StatusCode::from_u16(cached.status).unwrap_or(StatusCode::OK);
        return Ok((status, res_headers, cached.body.clone()).into_response());
    }

    if let Some(disk_response) = load_from_disk(target_url_str).await {
        tracing::debug!("disk cache hit for cover: {}", target_url_str);
        let (response, _) = disk_response;
        return Ok(response);
    }

    let mut current_url = target_url.clone();
    let mut upstream_res = None;
    for _ in 0..5 {
        let mut req_builder = state
            .asset_client
            .request(method.clone(), current_url.clone());
        for (k, v) in headers.iter() {
            let key_str = k.as_str();
            if !is_blacklisted_header(key_str)
                && !key_str.starts_with("cf-")
                && !key_str.starts_with("x-")
            {
                req_builder = req_builder.header(k, v);
            }
        }
        req_builder = req_builder.header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        );
        let origin = current_url.origin().ascii_serialization();
        req_builder = req_builder.header("Referer", format!("{}/", origin));

        let res = match req_builder.send().await {
            Ok(r) => r,
            Err(e) => {
                return Err(
                    (StatusCode::BAD_GATEWAY, format!("upstream error: {}", e)).into_response(),
                )
            }
        };

        if res.status().is_redirection() {
            if let Some(loc) = res.headers().get("location") {
                if let Ok(loc_str) = loc.to_str() {
                    if let Ok(next) = current_url.join(loc_str) {
                        current_url = next;
                        continue;
                    }
                }
            }
        }

        upstream_res = Some(res);
        break;
    }

    let upstream_res = match upstream_res {
        Some(r) => r,
        None => {
            return Err(
                (StatusCode::BAD_GATEWAY, "too many redirects".to_string()).into_response(),
            )
        }
    };

    let status = upstream_res.status();
    let mut safe_headers = HeaderMap::new();
    safe_headers.insert("Access-Control-Allow-Origin", HeaderValue::from_static("*"));
    safe_headers.insert(
        "Cache-Control",
        HeaderValue::from_static("public, max-age=31536000, immutable"),
    );
    if let Some(ct) = upstream_res.headers().get("content-type") {
        safe_headers.insert("content-type", ct.clone());
    }

    if !status.is_success() {
        return Ok((
            status,
            safe_headers,
            Body::from_stream(upstream_res.bytes_stream()),
        )
            .into_response());
    }

    let mut stream = upstream_res.bytes_stream();
    let mut accumulator = Vec::new();
    let mut total_size = 0usize;
    while let Some(chunk_res) = stream.next().await {
        if let Ok(chunk) = chunk_res {
            total_size += chunk.len();
            if total_size < 5 * 1024 * 1024 {
                accumulator.extend_from_slice(&chunk);
            } else {
                return Ok((status, safe_headers, Body::empty()).into_response());
            }
        } else {
            return Ok((status, safe_headers, Body::empty()).into_response());
        }
    }

    if accumulator.is_empty() {
        return Ok((status, safe_headers, Body::empty()).into_response());
    }

    let raw_bytes = Bytes::from(accumulator.clone());

    if !safe_headers.contains_key("content-type") {
        safe_headers.insert("content-type", HeaderValue::from_static("application/octet-stream"));
    }
    
    safe_headers.insert("content-length", HeaderValue::from(raw_bytes.len()));
    safe_headers.insert("X-Cache", HeaderValue::from_static("MISS"));

    let cached = Arc::new(CachedResponse {
        status: status.as_u16(),
        headers: safe_headers.clone(),
        body: raw_bytes.clone(),
    });
    state.cache.insert(target_url_str.to_string(), cached).await;

    let cache_key = target_url_str.to_string();
    let headers_for_disk = safe_headers.clone();
    let body_for_disk = raw_bytes.clone();
    let status_u16 = status.as_u16();
    tokio::spawn(async move {
        write_to_disk(&cache_key, status_u16, &headers_for_disk, &body_for_disk).await;
    });

    Ok((status, safe_headers, raw_bytes).into_response())
} 