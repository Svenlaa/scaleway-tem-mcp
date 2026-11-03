/**
 * Server icon advertised in the MCP initialize handshake (`serverInfo.icons`).
 *
 * A purple-gradient rounded square with a white envelope. Embedded as a
 * base64 data URI so the server stays self-contained over stdio and HTTP —
 * no hosted asset URL needed.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#c084fc"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="110" fill="url(#bg)"/>
  <rect x="88" y="156" width="336" height="200" rx="24" fill="#ffffff"/>
  <path d="M112 182 L256 274 L400 182" fill="none" stroke="#8b5cf6" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export const SERVER_ICON_SRC = `data:image/svg+xml;base64,${Buffer.from(SVG, 'utf8').toString('base64')}`;
