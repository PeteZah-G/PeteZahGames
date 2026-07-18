function submitSearch(event) {
  event.preventDefault();
  const query = document.getElementById('uv-address').value.trim();
  let embedUrl = '';

  if (query) {
    const isValidUrl = /^(https?:\/\/)?([\w\d-]+\.)+[\w\d]{2,}([\/\w\d-]*)*(\?[^\s]*)?(#[^\s]*)?$/i.test(query);

    if (isValidUrl) {
      embedUrl = `/static/youtube-embed.html#https://${encodeURIComponent(query)}`;
    } else {
      embedUrl = `/static/youtube-embed.html#https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }

    window.location.href = `/prox.html?embedUrl=${encodeURIComponent(embedUrl)}`;
  }
}
