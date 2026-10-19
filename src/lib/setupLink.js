/**
 * Magic setup link: encodes the GitHub token so a crew member can tap a link
 * and have the app configure itself — no copy/paste.
 *
 * Format: #setup=<base64url(JSON({ t: token }))>
 * The token lives in the URL fragment (never sent to the server). The app
 * reads it on launch, saves it, and clears the URL.
 */

const b64urlEncode = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlDecode = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b64)));
};

export function makeSetupLink(token) {
  const payload = b64urlEncode(JSON.stringify({ t: token }));
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  return `${base}#setup=${payload}`;
}

export function parseSetupLink() {
  try {
    const hash = window.location.hash || '';
    const m = hash.match(/^#setup=([A-Za-z0-9\-_]+)$/);
    if (!m) return null;
    const data = JSON.parse(b64urlDecode(m[1]));
    if (!data.t || typeof data.t !== 'string') return null;
    return { token: data.t };
  } catch {
    return null;
  }
}

export function clearSetupLink() {
  try {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {}
}
