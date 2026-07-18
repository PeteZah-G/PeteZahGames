use base64::Engine as _;

const MOCHI_XOR_KEY: &[u8] = b"q7Zx!9pL";

pub fn decode_mochi_url(encoded: &str) -> Option<String> {
    let mut b64 = encoded.replace('-', "+").replace('_', "/");
    while b64.len() % 4 != 0 {
        b64.push('=');
    }
    let mut raw = base64::engine::general_purpose::STANDARD
        .decode(&b64)
        .ok()?;
    for (i, b) in raw.iter_mut().enumerate() {
        *b ^= MOCHI_XOR_KEY[i % MOCHI_XOR_KEY.len()];
    }
    let percent_encoded = String::from_utf8(raw).ok()?;
    let decoded = urlencoding::decode(&percent_encoded).ok()?;
    let result = decoded.into_owned();
    if result.starts_with("http://") || result.starts_with("https://") {
        Some(result)
    } else {
        None
    }
}

pub fn encode_mochi_url(url: &str) -> String {
    let encoded = urlencoding::encode(url);
    let encoded_bytes = encoded.as_bytes();
    let xored: Vec<u8> = encoded_bytes
        .iter()
        .enumerate()
        .map(|(i, &b)| b ^ MOCHI_XOR_KEY[i % MOCHI_XOR_KEY.len()])
        .collect();
    let mut out = base64::engine::general_purpose::STANDARD
        .encode(&xored)
        .into_bytes();
    for b in out.iter_mut() {
        match *b {
            b'+' => *b = b'-',
            b'/' => *b = b'_',
            _ => {}
        }
    }
    while out.last() == Some(&b'=') {
        out.pop();
    }
    String::from_utf8(out).unwrap_or_default()
} 