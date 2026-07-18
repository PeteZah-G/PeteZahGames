let host = location.protocol + '//' + location.host;

let _CONFIG = {
  wispurl: localStorage.getItem('proxServer') || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/alt-wisp-5/',
  bareurl: host + '/bare/'
};
