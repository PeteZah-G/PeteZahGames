use aho_corasick::AhoCorasick;
use axum::http::{HeaderMap, HeaderValue};
use std::path::Path;
use crate::state::CDN_DOMAINS;

pub fn fix_game_content_type(url: &str, headers: &mut HeaderMap) {
    let url_without_query = url.split('?').next().unwrap_or(url);
    let path = Path::new(url_without_query);
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let mime = match ext {
            "wasm" => "application/wasm",
            "data" | "symbols" | "mem" | "unityweb" | "pck" | "bin" | "fbx" => {
                "application/octet-stream"
            }
            "glb" => "model/gltf-binary",
            "gltf" => "model/gltf+json",
            "obj" => "text/plain",
            "swf" => "application/x-shockwave-flash",
            "js" | "mjs" => "application/javascript",
            "json" => "application/json",
            "css" => "text/css",
            "html" => "text/html",
            "xml" => "application/xml",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "svg" => "image/svg+xml",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "avif" => "image/avif",
            "mp4" => "video/mp4",
            "webm" => "video/webm",
            "mp3" => "audio/mpeg",
            "ogg" => "audio/ogg",
            "wav" => "audio/wav",
            s if s.starts_with("part") => "application/octet-stream",
            _ => return,
        };
        headers.insert("Content-Type", HeaderValue::from_static(mime));
    }
}

pub fn is_likely_static_asset(url: &str) -> bool {
    is_likely_static_asset_fast(url, None)
}

pub fn is_likely_static_asset_fast(url: &str, _matcher: Option<&AhoCorasick>) -> bool {
    if url.contains("favicons?") {
        return true;
    }
    let url_without_query = url.split('?').next().unwrap_or(url);
    let exts = [
        ".wasm",
        ".pck",
        ".unityweb",
        ".data",
        ".mem",
        ".symbols",
        ".js",
        ".json",
        ".xml",
        ".glb",
        ".gltf",
        ".bin",
        ".fbx",
        ".obj",
        ".swf",
        ".p8",
        ".c3p",
        ".atlas",
        ".fnt",
        ".png",
        ".jpg",
        ".jpeg",
        ".mp3",
        ".ogg",
        ".wav",
        ".css",
        ".svg",
        ".gif",
        ".webp",
        ".avif",
        ".mp4",
        ".webm",
        ".woff",
        ".woff2",
        ".ttf",
        ".otf",
        ".eot",
        ".ico",
        ".aac",
        ".flac",
        ".m3u8",
    ];
    if exts.iter().any(|ext| url_without_query.ends_with(ext)) {
        return true;
    }
    if let Some(idx) = url_without_query.rfind(".part") {
        let suffix = &url_without_query[idx + 5..];
        if !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()) {
            return true;
        }
    }
    false
}

pub fn is_cdn_url(url: &str) -> bool {
    CDN_DOMAINS.iter().any(|domain| url.contains(domain))
}

pub fn get_cdn_cache_control(url: &str) -> &'static str {
    if is_cdn_url(url) {
        let has_version = url.contains("/v") || url.contains("@") || url.contains("/releases/");
        if has_version {
            "public, max-age=31536000, immutable"
        } else {
            "public, max-age=604800, stale-while-revalidate=86400"
        }
    } else {
        "public, max-age=86400, stale-while-revalidate=3600"
    }
}

pub fn is_blacklisted_header(name: &str) -> bool {
    matches!(
        name,
        "host"
            | "connection"
            | "content-length"
            | "transfer-encoding"
            | "upgrade"
            | "sec-websocket-key"
            | "sec-websocket-version"
            | "sec-websocket-extensions"
    )
}

pub fn is_blacklisted_res_header(name: &str) -> bool {
    matches!(
        name,
        "connection"
            | "content-length"
            | "transfer-encoding"
            | "content-encoding"
            | "content-security-policy"
            | "strict-transport-security"
            | "access-control-allow-origin"
            | "x-frame-options"
            | "x-content-type-options"
            | "speculation-rules"
            | "report-to"
            | "nel"
            | "referrer-policy"
            | "cross-origin-opener-policy"
            | "cross-origin-embedder-policy"
            | "cross-origin-resource-policy"
    )
} 