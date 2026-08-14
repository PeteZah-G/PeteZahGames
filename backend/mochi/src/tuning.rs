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
    let worker_threads = cores.saturating_sub(2).max(1).min(4);

    let cache_cap_mb = (ram_mb / 96).max(48).min(512);
    let cache_capacity_bytes = cache_cap_mb * 1024 * 1024;

    let max_entry_mb = (cache_cap_mb / 8).max(8).min(48);
    let max_cache_entry_size = (max_entry_mb as usize) * 1024 * 1024;

    let ram_cache_limit = 2 * 1024 * 1024;

    let cache_ttl_secs = if ram_mb < 8192 { 36 * 3600 } else { 72 * 3600 };

    let pool_idle_per_host_asset = (cores * 2).max(4).min(16);
    let pool_idle_per_host_html = cores.max(2).min(8);
    let pool_idle_timeout_secs = if ram_mb < 8192 { 90 } else { 180 };

    let request_permits = (cores * 96).max(96).min(2048);
    let html_rewrite_permits = (cores * 6).max(8).min(48);

    let disk_cache_gb = (disk_mb / 1024 / 16).max(4).min(80);
    let disk_cache_bytes = disk_cache_gb * 1024 * 1024 * 1024;
    let disk_max_age_secs = if disk_mb < 100_000 {
        72 * 3600
    } else {
        7 * 24 * 3600
    };
    let disk_cleanup_interval_secs = if disk_mb < 100_000 { 1200 } else { 2400 };

    let channel_buffer = if ram_mb < 8192 {
        32
    } else if ram_mb < 16384 {
        48
    } else {
        64
    };

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