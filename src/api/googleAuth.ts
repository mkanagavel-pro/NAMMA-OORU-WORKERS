// Thin client for the server-side "Continue with Google" flow. The browser never sees Google tokens or the
// client secret: it is redirected to /api/auth/google/start, and comes back to the app with either a one-time
// ticket (#google=...) or an error code (#google-error=...) in the URL fragment.

export const GOOGLE_START_URL = '/api/auth/google/start';

let enabledPromise: Promise<boolean> | null = null;
/** Is Google sign-in configured on this deployment? (cached for the page's lifetime) */
export function fetchGoogleEnabled(): Promise<boolean> {
  if (!enabledPromise) {
    enabledPromise = fetch('/api/auth/google/config')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => Boolean(d?.enabled))
      .catch(() => false);
  }
  return enabledPromise;
}

export type GoogleFragment =
  | { kind: 'ticket'; ticket: string }
  | { kind: 'error'; code: string }
  | { kind: 'linked' }
  | null;

/** Reads (and removes from the address bar) the result of the Google redirect. */
export function consumeGoogleFragment(): GoogleFragment {
  const hash = window.location.hash || '';
  let out: GoogleFragment = null;
  let m: RegExpExecArray | null;
  if ((m = /^#google=([A-Za-z0-9_-]{20,200})$/.exec(hash))) out = { kind: 'ticket', ticket: m[1] };
  else if ((m = /^#google-error=([a-z_]{1,40})$/.exec(hash))) out = { kind: 'error', code: m[1] };
  else if (hash === '#google-linked=1') out = { kind: 'linked' };
  if (out) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return out;
}
