mod cache;
mod constants;
mod cover;
mod encoding;
mod helpers;
mod proxy;
mod rewrite;
mod state;
mod tuning;
mod websocket;

use aho_corasick::AhoCorasick;
use axum::{routing::any, Router};
use dashmap::DashMap;
use mimalloc::MiMalloc;
use moka::future::Cache;
use reqwest::{redirect::Policy, Client};
use state::{AppState, CachedResponse};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("mochi=info")
        .init();

    let t = tuning::detect();

    tracing::info!(
        "tuning: {} workers, {}MB cache cap, {}MB max entry, {}MB ram limit, {} req permits, {} rewrite permits, {}GB disk cache",
        t.worker_threads,
        t.cache_capacity_bytes / (1024 * 1024),
        t.max_cache_entry_size / (1024 * 1024),
        t.ram_cache_limit / (1024 * 1024),
        t.request_permits,
        t.html_rewrite_permits,
        t.disk_cache_bytes / (1024 * 1024 * 1024),
    );

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(t.worker_threads)
        .enable_all()
        .build()
        .expect("failed to build tokio runtime");

    rt.block_on(async_main(t));
}

async fn async_main(t: tuning::MochiTuning) {
    let _ = tokio::fs::create_dir_all("./cache").await;

    let cache = Cache::builder()
        .max_capacity(t.cache_capacity_bytes)
        .weigher(|_key: &String, val: &Arc<CachedResponse>| -> u32 {
            (val.body.len() as u32).saturating_add(200)
        })
        .time_to_live(Duration::from_secs(t.cache_ttl_secs))
        .build();

    let asset_client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .danger_accept_invalid_certs(true)
        .redirect(Policy::default())
        .pool_idle_timeout(Duration::from_secs(t.pool_idle_timeout_secs))
        .pool_max_idle_per_host(t.pool_idle_per_host_asset)
        .tcp_nodelay(true)
        .tcp_keepalive(Duration::from_secs(60))
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(10))
        .http2_keep_alive_interval(Duration::from_secs(15))
        .http2_keep_alive_timeout(Duration::from_secs(20))
        .build()
        .expect("failed to build asset client");

    let html_client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .danger_accept_invalid_certs(true)
        .redirect(Policy::default())
        .pool_idle_timeout(Duration::from_secs(t.pool_idle_timeout_secs))
        .pool_max_idle_per_host(t.pool_idle_per_host_html)
        .tcp_nodelay(true)
        .tcp_keepalive(Duration::from_secs(60))
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(10))
        .http2_keep_alive_interval(Duration::from_secs(15))
        .http2_keep_alive_timeout(Duration::from_secs(20))
        .build()
        .expect("failed to build html client");

    let patterns = [
        "google-analytics.com",
        "googletagmanager.com",
        "doubleclick.net",
        "adsbygoogle",
        "js.rev.iq",
        "motorsnag.com",
        "monetag",
        "netpub",
    ];
    let blocklist_matcher = Arc::new(AhoCorasick::new(&patterns).unwrap());

    let asset_exts = [
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
    let asset_ext_matcher = Arc::new(AhoCorasick::new(&asset_exts).unwrap());

    let state = Arc::new(AppState {
        html_client,
        asset_client,
        cache,
        blocklist_matcher,
        asset_ext_matcher,
        caching_inflight: DashMap::new(),
        coalesce: DashMap::new(),
        request_permit: Arc::new(Semaphore::new(t.request_permits)),
        html_rewrite_permit: Arc::new(Semaphore::new(t.html_rewrite_permits)),
        max_cache_entry_size: t.max_cache_entry_size,
        ram_cache_limit: t.ram_cache_limit,
        channel_buffer: t.channel_buffer,
    });

    let port = std::env::var("MOCHI_PORT").unwrap_or_else(|_| "4000".to_string());
    let port = port.parse::<u16>().unwrap_or(4000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("listening on {}!!", addr);

    tokio::spawn(cache::disk_cache_cleanup_task(
        t.disk_cache_bytes,
        t.disk_max_age_secs,
        t.disk_cleanup_interval_secs,
    ));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", axum::routing::get(|| async { "ok" }))
        .route("/", any(proxy::proxy_handler))
        .route("/*path", any(proxy::proxy_handler))
        .layer(CompressionLayer::new())
        .layer(cors)
        .route(
            &format!("{}*key", constants::MOCHI_PREFIX),
            any(proxy::proxy_handler),
        )
        .fallback(any(proxy::proxy_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app)
        .tcp_nodelay(true)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
            tracing::info!("shutting down...");
        })
        .await
        .unwrap();
} 