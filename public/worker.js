// worker.js
if (navigator.userAgent.includes('Firefox')) {
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value: true,
    writable: false
  });
}

const res_path = ["/res/main", ".js"].join("");

try {
  importScripts(res_path);
} catch (e) {
  // Console logging is not a lot to avoid fingerprinting :/
}

const hook = self.$scramjetLoadWorker || (self.scramjet && self.scramjet.loadWorker);

if (hook) {
  const setup = hook();
  const worker_engine = new setup.ScramjetServiceWorker();

  async function handle_ev(event) {
    try {
      await worker_engine.loadConfig();
      if (worker_engine.route(event)) {
        return await worker_engine.fetch(event);
      }
    } catch (err) {
      // Internal routing failure fallback
    }
    return fetch(event.request);
  }

  self.addEventListener('fetch', (ev) => {
    ev.respondWith(handle_ev(ev));
  });

  let mem_store;

  self.addEventListener('message', ({ data }) => {
    if (data && data.type === 'playgroundData') {
      mem_store = data;
    }
  });

  worker_engine.addEventListener('request', (req) => {
    if (mem_store && req.url.href.startsWith(mem_store.origin)) {
      const mimes = {
        h: 'text/html',
        c: 'text/css',
        j: 'application/javascript'
      };
      
      const host = mem_store.origin;
      let body = '';
      let type = 'text/plain';

      if (req.url.href === host + '/') {
        type = mimes.h;
        body = mem_store.html;
      } else if (req.url.href === host + '/style.css') {
        type = mimes.c;
        body = mem_store.css;
      } else if (req.url.href === host + '/script.js') {
        type = mimes.j;
        body = mem_store.js;
      }

      const headers = { 'content-type': type };
      req.response = new Response(body, { headers });
      req.response.rawHeaders = headers;
      req.response.rawResponse = {
        body: req.response.body,
        headers: headers,
        status: 200,
        statusText: 'OK'
      };
      req.response.finalURL = req.url.toString();
    }
  });
}