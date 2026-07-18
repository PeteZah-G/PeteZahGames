use axum::body::Body;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{Duration, SystemTime};
use tokio::fs::{self, File};
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufWriter};
use tokio_util::io::ReaderStream;
use crate::helpers::{fix_game_content_type, is_likely_static_asset};

pub fn get_cache_path(url: &str) -> String {
    let cache_key = if is_likely_static_asset(url) && !url.contains("favicons?") {
        url.split('?').next().unwrap_or(url)
    } else {
        url
    };
    let mut hasher = DefaultHasher::new();
    cache_key.hash(&mut hasher);
    let hash = hasher.finish();
    format!("./cache/{:x}.bin", hash)
}

pub async fn load_from_disk(url: &str) -> Option<(Response, bool)> {
    let path = get_cache_path(url);
    let file = File::open(&path).await.ok()?;
    let _metadata = file.metadata().await.ok()?;
    let mut reader = tokio::io::BufReader::new(file);

    let mut buf_u16 = [0u8; 2];
    reader.read_exact(&mut buf_u16).await.ok()?;
    let status_code = u16::from_le_bytes(buf_u16);

    reader.read_exact(&mut buf_u16).await.ok()?;
    let header_count = u16::from_le_bytes(buf_u16);

    let mut headers = HeaderMap::new();
    for _ in 0..header_count {
        reader.read_exact(&mut buf_u16).await.ok()?;
        let k_len = u16::from_le_bytes(buf_u16) as usize;
        let mut k_buf = vec![0u8; k_len];
        reader.read_exact(&mut k_buf).await.ok()?;
        let key_str = String::from_utf8(k_buf).ok()?;

        let mut buf_u32 = [0u8; 4];
        reader.read_exact(&mut buf_u32).await.ok()?;
        let v_len = u32::from_le_bytes(buf_u32) as usize;
        let mut v_buf = vec![0u8; v_len];
        reader.read_exact(&mut v_buf).await.ok()?;

        let h_name = axum::http::header::HeaderName::from_bytes(key_str.as_bytes()).ok()?;
        let h_val = axum::http::header::HeaderValue::from_bytes(&v_buf).ok()?;
        headers.insert(h_name, h_val);
    }

    headers.insert("X-Cache", HeaderValue::from_static("DISK"));
    fix_game_content_type(url, &mut headers);

    let status = StatusCode::from_u16(status_code).unwrap_or(StatusCode::OK);
    let stream = ReaderStream::new(reader);
    let body = Body::from_stream(stream);
    Some(((status, headers, body).into_response(), false))
}

pub async fn write_to_disk(cache_key: &str, status: u16, headers: &HeaderMap, body: &Bytes) {
    let cache_path = get_cache_path(cache_key);
    let temp_path = format!("{}.{}.tmp", cache_path, uuid::Uuid::new_v4());
    let Ok(f) = File::create(&temp_path).await else {
        return;
    };
    let mut f = BufWriter::new(f);

    let header_count = headers.len() as u16;
    if f.write_all(&status.to_le_bytes()).await.is_err()
        || f.write_all(&header_count.to_le_bytes()).await.is_err()
    {
        let _ = fs::remove_file(&temp_path).await;
        return;
    }

    for (k, v) in headers.iter() {
        let k_bytes = k.as_str().as_bytes();
        let k_len = k_bytes.len() as u16;
        if f.write_all(&k_len.to_le_bytes()).await.is_err() {
            break;
        }
        if f.write_all(k_bytes).await.is_err() {
            break;
        }
        let v_bytes = v.as_bytes();
        let v_len = v_bytes.len() as u32;
        if f.write_all(&v_len.to_le_bytes()).await.is_err() {
            break;
        }
        if f.write_all(v_bytes).await.is_err() {
            break;
        }
    }

    let _ = f.write_all(body).await;
    let _ = f.flush().await;
    let _ = f.into_inner().sync_all().await;
    let _ = fs::rename(&temp_path, &cache_path).await;
}

pub async fn disk_cache_cleanup_task(
    max_bytes: u64,
    max_age_secs: u64,
    cleanup_interval_secs: u64,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(cleanup_interval_secs));
    interval.tick().await;
    let cache_dir = "./cache";
    loop {
        tokio::time::sleep(Duration::from_secs(cleanup_interval_secs.max(60))).await;

        let mut entries = match fs::read_dir(cache_dir).await {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!("failed to read cache for cleanup: {}", e);
                continue;
            }
        };

        let mut files = Vec::new();
        let mut total_size = 0u64;
        let now = SystemTime::now();
        while let Ok(Some(entry)) = entries.next_entry().await {
            if let Ok(metadata) = entry.metadata().await {
                if metadata.is_file() {
                    let size = metadata.len();
                    let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                    let age_secs = now
                        .duration_since(modified)
                        .unwrap_or(Duration::from_secs(0))
                        .as_secs();

                    if age_secs > max_age_secs {
                        if fs::remove_file(entry.path()).await.is_ok() {
                            tracing::debug!("deleted old cache: {:?}", entry.path());
                        }
                        continue;
                    }

                    files.push((entry.path(), size, modified));
                    total_size += size;
                }
            }
        }

        if total_size <= max_bytes {
            continue;
        }

        files.sort_by_key(|&(_, _, modified)| modified);

        for (path, size, modified) in files {
            let age_secs = now
                .duration_since(modified)
                .unwrap_or(Duration::from_secs(0))
                .as_secs();
            if age_secs > max_age_secs || total_size > max_bytes {
                if fs::remove_file(&path).await.is_ok() {
                    total_size = total_size.saturating_sub(size);
                    tracing::debug!("deleted old cache: {:?}", path);
                }
            } else if total_size <= max_bytes {
                break;
            }
        }
    }
} 