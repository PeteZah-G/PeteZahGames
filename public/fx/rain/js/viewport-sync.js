(function () {
  "use strict";

  var lastWidth = window.innerWidth;
  var lastHeight = window.innerHeight;
  var reloadTimer = 0;

  function fitCanvas() {
    var canvas = document.getElementById("rain-canvas");
    if (!canvas) return;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  }

  function handleViewportChange() {
    fitCanvas();
    var nextWidth = window.innerWidth;
    var nextHeight = window.innerHeight;
    if (Math.abs(nextWidth - lastWidth) < 2 && Math.abs(nextHeight - lastHeight) < 2) return;
    lastWidth = nextWidth;
    lastHeight = nextHeight;
    window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(function () {
      window.location.reload();
    }, 280);
  }

  fitCanvas();
  window.addEventListener("resize", handleViewportChange, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", handleViewportChange, { passive: true });
  }
})();
