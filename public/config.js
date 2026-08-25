let host = location.protocol + '//' + location.host;
let stream = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/websocket/';
try {
  var id = localStorage.getItem('selectedVpnRegion') || 'default';
  var custom = (localStorage.getItem('proxServer') || '').trim();
  if (id === 'custom') {
    var cu = new URL(custom);
    if ((cu.protocol === 'wss:' || cu.protocol === 'ws:') && custom.charAt(custom.length - 1) === '/') stream = custom;
  }
} catch (e) {}

let _CONFIG = {
  streamurl: stream,
  bareurl: host + '/api/edge/'
};
