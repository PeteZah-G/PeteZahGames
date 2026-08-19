let host = location.protocol + '//' + location.host;

let _CONFIG = {
  streamurl: localStorage.getItem('proxServer') || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/websocket/',
  bareurl: host + '/api/edge/'
};
