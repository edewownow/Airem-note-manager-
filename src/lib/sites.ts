/**
 * 2.0.0-autofill.1 (autofill plan, phase 0) — the "Website or app" of a saved password.
 *
 * Stored in the password item's `location` field (unused for passwords until now — the record shape
 * stays fixed). Autofill will later match it against the page's domain or the app asking, so a
 * website is kept as its bare host: "https://www.Gmail.com/login?x=1" → "gmail.com". Anything that
 * isn't a web address (an app's name, "BDO app") is kept as typed.
 */

/** A typed website or app → what is stored, or null for empty. */
export function normalizeSite(input: string | null | undefined): string | null {
  const t = (input ?? '').trim();
  if (!t) return null;
  const looksLikeAddress = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || (/^[^\s/]+\.[a-z]{2,}(?:[:/?#].*)?$/i.test(t) && !/\s/.test(t));
  if (!looksLikeAddress) return t.slice(0, 100);
  const host = t
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') // scheme
    .replace(/^[^@/]*@/, '') // user:pass@
    .split(/[/?#]/)[0] // path, query, fragment
    .replace(/:\d+$/, '') // port
    .replace(/\.$/, '')
    .toLowerCase()
    .replace(/^www\d*\./, '');
  return host || null;
}

/** Is this stored value a web host (vs an app's name)? */
export function isWebHost(site: string | null | undefined): boolean {
  return !!site && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site);
}
