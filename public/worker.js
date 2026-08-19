if (navigator.userAgent.includes('Firefox')) {
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value: true,
    writable: false
  });
}

var _p = ['/q', '9vx/'].join('');
var _f = ['sj', '.all', '.js'].join('');
try {
  importScripts(_p + _f);
} catch (e) {}

var _lw = ['$', 'dusk', 'line', 'Load', 'Worker'].join('');
var _sw = ['Dusk', 'line', 'Service', 'Worker'].join('');
var _hook = self[_lw];
if (!_hook) {
  /* engine missing */
} else {
  var _setup = _hook();
  var worker_engine = new _setup[_sw]();

  async function handle_ev(event) {
    try {
      await worker_engine.loadConfig();
      if (worker_engine.route(event)) {
        return await worker_engine.fetch(event);
      }
    } catch (err) {}
    return fetch(event.request);
  }

  self.addEventListener('fetch', function (ev) {
    ev.respondWith(handle_ev(ev));
  });
}
