export const urlCodecEncode = (url: string): string => {
  if (!url) return url;
  var k = String.fromCharCode(104, 121, 112, 101, 115, 116, 117, 100, 121, 95, 112, 120, 95, 107, 49);
  var x = "";
  for (var i = 0; i < url.length; i++) {
    x += String.fromCharCode(url.charCodeAt(i) ^ k.charCodeAt(i % k.length));
  }
  var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var o = "";
  for (var j = 0; j < x.length; j++) {
    var c = x.charCodeAt(j);
    o += A[(c >> 12) & 63] + A[(c >> 6) & 63] + A[c & 63];
  }
  return o;
};

export const urlCodecDecode = (url: string): string => {
  if (!url) return url;
  var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var x = "";
  for (var i = 0; i + 2 < url.length; i += 3) {
    var a = A.indexOf(url[i]);
    var b = A.indexOf(url[i + 1]);
    var c = A.indexOf(url[i + 2]);
    if (a < 0 || b < 0 || c < 0) break;
    x += String.fromCharCode((a << 12) | (b << 6) | c);
  }
  var k = String.fromCharCode(104, 121, 112, 101, 115, 116, 117, 100, 121, 95, 112, 120, 95, 107, 49);
  var o = "";
  for (var j = 0; j < x.length; j++) {
    o += String.fromCharCode(x.charCodeAt(j) ^ k.charCodeAt(j % k.length));
  }
  return o;
};
