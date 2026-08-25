export function toMochiBackendPath(raw) {
  const input = String(raw || '');
  const q = input.indexOf('?');
  let p = q === -1 ? input : input.slice(0, q);
  const query = q === -1 ? '' : input.slice(q);

  if (p.startsWith('/f/c/') || p.startsWith('/!cover!/')) return input;

  p = p.replace(/^\/(?:n\/m|f\/g)\//, '/!!/');
  if (!p.startsWith('/!!/')) return input;

  const rest = p.slice(4);
  if (rest.startsWith('hs/')) return '/!!/https://' + rest.slice(3) + query;
  if (rest.startsWith('ht/')) return '/!!/http://' + rest.slice(3) + query;
  return p + query;
}
