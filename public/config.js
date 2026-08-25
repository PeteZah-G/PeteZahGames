let host = location.protocol + '//' + location.host;

let _CONFIG = {
  streamurl: localStorage.getItem('proxServer') || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/n/s/',
  bareurl: host + '/api/edge/'
};
