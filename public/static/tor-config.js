let host = location.protocol + '//' + location.host;

let _CONFIG = {
  wispurl: localStorage.getItem('proxServer') || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/wisp-tor/',
  bareurl: host + '/api/edge/'
};
