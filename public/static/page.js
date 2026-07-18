const urlParams = new URLSearchParams(window.location.search);
const embedUrl = urlParams.get('embedUrl');

const iframe = document.getElementById('viewer-iframe');

iframe.src = embedUrl;

document.getElementById('back-btn').addEventListener('click', () => {
  iframe.contentWindow.history.back();
});

document.getElementById('forward-btn').addEventListener('click', () => {
  iframe.contentWindow.history.forward();
});

document.getElementById('reload-btn').addEventListener('click', () => {
  iframe.contentWindow.location.reload();
});

document.getElementById('fullscreen-btn').addEventListener('click', () => {
  if (iframe.requestFullscreen) {
    iframe.requestFullscreen();
  } else if (iframe.mozRequestFullScreen) {
    iframe.mozRequestFullScreen();
  } else if (iframe.webkitRequestFullscreen) {
    iframe.webkitRequestFullscreen();
  } else if (iframe.msRequestFullscreen) {
    iframe.msRequestFullscreen();
  }
});
