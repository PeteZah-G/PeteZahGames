function submitSearch(event) {
  event.preventDefault();
  const query = document.getElementById('uv-address').value.trim();
  if (!query) return;

  const isValidUrl = /^(https?:\/\/)?([\w\d-]+\.)+[\w\d]{2,}([\/\w\d-]*)*(\?[^\s]*)?(#[^\s]*)?$/i.test(query);
  let target;
  if (isValidUrl) {
    target = /^(https?:)?\/\//i.test(query) ? query.replace(/^\/\//, "https://") : "https://" + query;
  } else {
    target = "https://www.google.com/search?q=" + encodeURIComponent(query);
  }
  window.location.href = "/embed.html#" + target;
}
