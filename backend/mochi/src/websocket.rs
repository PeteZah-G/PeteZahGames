use axum::extract::ws::{Message, WebSocket};
use axum::http::HeaderMap;
use futures::{sink::SinkExt, stream::StreamExt};
use tokio::time::{timeout, Duration};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{handshake::client::generate_key, protocol::Message as TungsteniteMessage},
};
use url::Url;
use crate::helpers::is_blocked_target;

const MAX_WS_MSG: usize = 2 * 1024 * 1024;
const WS_IDLE: Duration = Duration::from_secs(120);

pub async fn handle_socket(client_socket: WebSocket, target_url: String, headers: HeaderMap) {
    let parsed = match Url::parse(&target_url) {
        Ok(u) => u,
        Err(_) => return,
    };
    if is_blocked_target(&parsed) {
        return;
    }

    let (mut client_sender, mut client_receiver) = client_socket.split();

    let mut request = axum::http::Request::builder().uri(&target_url);
    request = request.header("Sec-WebSocket-Key", generate_key());
    request = request.header("Sec-WebSocket-Version", "13");
    request = request.header("Connection", "Upgrade");
    request = request.header("Upgrade", "websocket");

    if let Some(host) = parsed.host_str() {
        request = request.header("Host", host);
        request = request.header("Origin", parsed.origin().ascii_serialization());
    }

    for (k, v) in headers.iter() {
        let key = k.as_str();
        if key.eq_ignore_ascii_case("sec-websocket-protocol")
            || key.eq_ignore_ascii_case("cookie")
            || key.eq_ignore_ascii_case("authorization")
        {
            request = request.header(k, v);
        }
    }

    let request = match request.body(()) {
        Ok(r) => r,
        Err(_) => return,
    };

    let (ws_stream, _) = match timeout(Duration::from_secs(10), connect_async(request)).await {
        Ok(Ok(s)) => s,
        _ => {
            tracing::warn!("ws connect failed to {}", parsed.host_str().unwrap_or("?"));
            return;
        }
    };

    let (mut upstream_sender, mut upstream_receiver) = ws_stream.split();

    let client_to_upstream = tokio::spawn(async move {
        loop {
            match timeout(WS_IDLE, client_receiver.next()).await {
                Ok(Some(Ok(msg))) => {
                    let tungstenite_msg = match msg {
                        Message::Text(t) => {
                            if t.len() > MAX_WS_MSG {
                                break;
                            }
                            TungsteniteMessage::Text(t)
                        }
                        Message::Binary(b) => {
                            if b.len() > MAX_WS_MSG {
                                break;
                            }
                            TungsteniteMessage::Binary(b.into())
                        }
                        Message::Ping(b) => TungsteniteMessage::Ping(b.into()),
                        Message::Pong(b) => TungsteniteMessage::Pong(b.into()),
                        Message::Close(_) => TungsteniteMessage::Close(None),
                    };
                    if upstream_sender.send(tungstenite_msg).await.is_err() {
                        break;
                    }
                }
                _ => break,
            }
        }
    });

    let upstream_to_client = tokio::spawn(async move {
        loop {
            match timeout(WS_IDLE, upstream_receiver.next()).await {
                Ok(Some(Ok(msg))) => {
                    let axum_msg = match msg {
                        TungsteniteMessage::Text(t) => {
                            if t.len() > MAX_WS_MSG {
                                break;
                            }
                            Message::Text(t)
                        }
                        TungsteniteMessage::Binary(b) => {
                            if b.len() > MAX_WS_MSG {
                                break;
                            }
                            Message::Binary(b.into())
                        }
                        TungsteniteMessage::Ping(b) => Message::Ping(b.into()),
                        TungsteniteMessage::Pong(b) => Message::Pong(b.into()),
                        TungsteniteMessage::Close(_) => Message::Close(None),
                        TungsteniteMessage::Frame(_) => continue,
                    };
                    if client_sender.send(axum_msg).await.is_err() {
                        break;
                    }
                }
                _ => break,
            }
        }
    });

    let _ = tokio::join!(client_to_upstream, upstream_to_client);
}
