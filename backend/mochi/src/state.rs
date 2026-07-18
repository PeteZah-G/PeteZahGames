use aho_corasick::AhoCorasick;
use axum::http::HeaderMap;
use bytes::Bytes;
use dashmap::DashMap;
use moka::future::Cache;
use reqwest::Client;
use std::sync::Arc;
use tokio::sync::{broadcast, Semaphore};

#[derive(Clone)]
pub struct CachedResponse {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Bytes,
}

pub struct AppState {
    pub html_client: Client,
    pub asset_client: Client,
    pub cache: Cache<String, Arc<CachedResponse>>,
    pub blocklist_matcher: Arc<AhoCorasick>,
    pub asset_ext_matcher: Arc<AhoCorasick>,
    pub caching_inflight: DashMap<String, ()>,
    pub coalesce: DashMap<String, broadcast::Sender<Arc<CachedResponse>>>,
    pub request_permit: Arc<Semaphore>,
    pub html_rewrite_permit: Arc<Semaphore>,
    pub max_cache_entry_size: usize,
    pub ram_cache_limit: usize,
    pub channel_buffer: usize,
}

pub const CDN_DOMAINS: &[&str] = &[
    "site-assets.fontawesome.com",
    "ka-f.fontawesome.com",
    "kit.fontawesome.com",
    "cdn.cloudflare.com",
    "ajax.googleapis.com",
    "cdn.jsdelivr.net",
    "raw.githubusercontent.com",
    "gn-math.dev",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
]; 