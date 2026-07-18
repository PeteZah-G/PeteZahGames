if (navigator.userAgent.includes("Firefox")) {
  Object.defineProperty(globalThis, "crossOriginIsolated", {
    value: true,
    writable: false,
  });
}

var _nm = ["scr", "amjet"].join("");
importScripts("/nx/" + _nm + ".all.js");

var _lw = ["$scr", "amjet", "Load", "Worker"].join("");
var _sw = ["Scr", "amjet", "Service", "Worker"].join("");
var _exports = self[_lw]();
var scramjet = new _exports[_sw]();

async function handleRequest(event) {
  await scramjet.loadConfig();

  var url = new URL(event.request.url);

  if (scramjet.route(event)) {
    return scramjet.fetch(event);
  }

  return fetch(event.request);
}

self.addEventListener("fetch", function (event) {
  event.respondWith(handleRequest(event));
});

var playgroundData;
self.addEventListener("message", function ({ data }) {
  if (data.type === "playgroundData") {
    playgroundData = data;
  }
});

scramjet.addEventListener("request", function (e) {
  if (playgroundData && e.url.href.startsWith(playgroundData.origin)) {
    var headers = {};
    var origin = playgroundData.origin;
    if (e.url.href === origin + "/") {
      headers["content-type"] = "text/html";
      e.response = new Response(playgroundData.html, { headers });
    } else if (e.url.href === origin + "/style.css") {
      headers["content-type"] = "text/css";
      e.response = new Response(playgroundData.css, { headers });
    } else if (e.url.href === origin + "/script.js") {
      headers["content-type"] = "application/javascript";
      e.response = new Response(playgroundData.js, { headers });
    } else {
      e.response = new Response("empty response", { headers });
    }
    e.response.rawHeaders = headers;
    e.response.rawResponse = {
      body: e.response.body,
      headers: headers,
      status: e.response.status,
      statusText: e.response.statusText,
    };
    e.response.finalURL = e.url.toString();
  } else {
    return;
  }
});
