/** Runtime decode so minify cannot fold names back into plaintext. */
export function revealCodes(codes: readonly number[]): string {
  let out = "";
  for (let i = 0; i < codes.length; i++) {
    out += String.fromCharCode(codes[i] ^ 23 ^ (i & 3));
  }
  return out;
}
