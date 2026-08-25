let host = location.protocol + '//' + location.host;

let _CONFIG = {
  streamurl: (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/websocket-2/',
  bareurl: host + '/api/edge/'
};
