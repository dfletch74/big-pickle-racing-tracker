/**
 * App update checker.
 * iOS home-screen apps cache aggressively — this pulls the latest bundle hash
 * from index.html and reloads if a newer version is deployed.
 */

export function currentBundleHash() {
  try {
    const src = [...document.scripts].map((x) => x.src).find((u) => /index-[A-Za-z0-9_-]+\.js/.test(u)) || '';
    const m = src.match(/index-([A-Za-z0-9_-]+)\.js/);
    return m ? m[1] : 'dev';
  } catch {
    return 'dev';
  }
}

/**
 * Check for an update. Returns the new hash if available, null if up to date.
 * Does not reload — the caller decides what to do.
 */
export async function checkForAppUpdate() {
  try {
    const base = import.meta.env.BASE_URL;
    const res = await fetch(`${base}index.html?ts=${Date.now()}`, { cache: 'no-store' });
    const html = await res.text();
    const m = html.match(/assets\/index-([A-Za-z0-9_-]+)\.js/);
    if (!m) return null;
    const latest = m[1];
    const current = currentBundleHash();
    return latest !== current ? latest : null;
  } catch {
    return null;
  }
}

/**
 * Reload to the latest version (cache-busted).
 */
export function reloadForUpdate() {
  const base = import.meta.env.BASE_URL;
  window.location.href = `${base}?v=${Date.now()}`;
}
