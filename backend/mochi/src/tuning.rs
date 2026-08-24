use sysinfo::{Disks, System};

pub struct MochiTuning {
    pub worker_threads: usize,
    pub cache_capacity_bytes: u64,
    pub cache_ttl_secs: u64,
    pub max_cache_entry_size: usize,
    pub ram_cache_limit: usize,
    pub pool_idle_per_host_asset: usize,
    pub pool_idle_per_host_html: usize,
    pub pool_idle_timeout_secs: u64,
    pub request_permits: usize,
    pub html_rewrite_permits: usize,
    pub disk_cache_bytes: u64,
    pub disk_max_age_secs: u64,
    pub disk_cleanup_interval_secs: u64,
    pub channel_buffer: usize,
}

pub fn detect() -> MochiTuning {
    let mut sys = System::new();
    sys.refresh_memory();
    let ram_mb = sys.total_memory() / (1024 * 1024);
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(2);

    let disks = Disks::new_with_refreshed_list();
    let disk_mb = disks
        .list()
        .iter()
        .map(|d| d.available_space() / (1024 * 1024))
        .max()
        .unwrap_or(10_000);

    tracing::info!(
        "detected system: {}MB RAM, {} cores, {}MB disk",
        ram_mb,
        cores,
        disk_mb
    );

    compute(ram_mb, cores, disk_mb)
}

fn compute(ram_mb: u64, cores: usize, disk_mb: u64) -> MochiTuning {
    let worker_threads = cores.saturating_sub(1).max(2).min(6);

    let cache_cap_mb = (ram_mb / 128).max(32).min(256);
    let cache_capacity_bytes = cache_cap_mb * 1024 * 1024;

    let max_entry_mb = (cache_cap_mb / 8).max(4).min(16);
    let max_cache_entry_size = (max_entry_mb as usize) * 1024 * 1024;

    let ram_limit_mb = (cache_cap_mb / 8).max(16).min(32);
    let ram_cache_limit = (ram_limit_mb as usize) * 1024 * 1024;

    let cache_ttl_secs = if ram_mb < 8192 { 36 * 3600 } else { 72 * 3600 };

    let pool_idle_per_host_asset = (cores * 3).max(4).min(24);
    let pool_idle_per_host_html = (cores * 2).max(2).min(12);
    let pool_idle_timeout_secs = if ram_mb < 8192 { 120 } else { 240 };

    let request_permits = (cores * 24).max(64).min(256);
    let html_rewrite_permits = (cores * 8).max(8).min(64);

    let disk_cache_gb = (disk_mb / 1024 / 20).max(2).min(80);
    let disk_cache_bytes = disk_cache_gb * 1024 * 1024 * 1024;
    let disk_max_age_secs = if disk_mb < 100_000 {
        72 * 3600
    } else {
        7 * 24 * 3600
    };
    let disk_cleanup_interval_secs = if disk_mb < 100_000 { 1800 } else { 3600 };

    let channel_buffer = if ram_mb < 8192 { 16 } else { 24 };

    MochiTuning {
        worker_threads,
        cache_capacity_bytes,
        cache_ttl_secs,
        max_cache_entry_size,
        ram_cache_limit,
        pool_idle_per_host_asset,
        pool_idle_per_host_html,
        pool_idle_timeout_secs,
        request_permits,
        html_rewrite_permits,
        disk_cache_bytes,
        disk_max_age_secs,
        disk_cleanup_interval_secs,
        channel_buffer,
    }
} 