# Continue with Google

Server-side OAuth 2.0 / OpenID Connect (authorization-code flow). No Google script runs in the browser and the
browser never sees Google tokens or the client secret.

## 1. Google Cloud Console setup

1. <https://console.cloud.google.com/> -> create/select a project.
2. **APIs & Services -> OAuth consent screen**: user type *External*, app name *Namma Ooru Workers*, support e-mail,
   authorised domain = your domain. Scopes: only `openid`, `email`, `profile` (all non-sensitive). While the app is in
   *Testing* only listed test users can sign in; click **Publish app** for everyone.
3. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**, type **Web application**.
4. **Authorised redirect URIs** (exact match, including https and no trailing slash):
   - production: `https://YOUR-DOMAIN/api/auth/google/callback`
   - local development (optional): `http://localhost:3000/api/auth/google/callback`
   No "Authorised JavaScript origins" are needed (nothing runs in the browser).
5. Copy the client id and secret into the server's environment (never into git, never into a `VITE_` variable):

```
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
GOOGLE_CALLBACK_URL="https://YOUR-DOMAIN/api/auth/google/callback"
```

`GOOGLE_CALLBACK_URL` must end in `/api/auth/google/callback` (that is the route this server serves) and must equal the
registered URI character for character, otherwise Google answers `redirect_uri_mismatch`. If any of the three variables is
missing or invalid the feature is off and the button is shown disabled.

Behind a reverse proxy, make sure the proxy forwards `/api/auth/google/*` to this server and that the public site and the
API share one origin (the callback redirects to `/#google=...` on that origin).

## 2. How it works

| Step | Where | What |
|---|---|---|
| 1 | `GET /api/auth/google/start` | Creates a random `state`, `nonce`, PKCE verifier and a browser-binding secret. Only hashes of `state`/binding are stored (10 min TTL). The binding secret is set as an `HttpOnly; SameSite=Lax; Secure` cookie. Redirects to Google (`openid email profile`, no offline access). |
| 2 | `GET /api/auth/google/callback` | Atomically consumes the `state` (one use) and requires the binding cookie (stops login-CSRF), exchanges the code with the PKCE verifier, **verifies the ID token** (signature, issuer, audience, expiry via `google-auth-library`, plus our own nonce and `email_verified === true` checks), discards access/refresh tokens, then decides what the identity may do. |
| 3 | `POST /api/auth/google/exchange` | The app trades the one-time ticket from the URL fragment for the normal session token (same JWT, `tokenVersion` revocation, DB re-check of role/status on every request). |
| 4 | `POST /api/auth/google/complete` | New Google users choose Customer/Worker and supply what Google cannot (worker: User ID, phone, password, category, location, consent...). |
| 5 | `POST /api/auth/google/link/start` | A signed-in user links Google ("authenticate first" path; Navbar -> account menu). |

### Account rules (`decideGoogleSignIn`)
* The Google `sub` is the identity. Account already linked to it -> sign in.
* Verified Google e-mail matches an existing account whose e-mail is **verified** -> linked automatically (same account, no duplicate, password hash untouched).
* Existing account with an **unverified** e-mail -> refused (someone could have pre-registered the address); verify it first.
* Existing account already linked to a **different** Google identity -> refused, never overwritten.
* **Administrators can never use Google** (sign-in, linking and registration all refuse admin accounts; Google-created accounts are only ever `customer` or `worker`).
* Restricted accounts are refused.
* No account -> nothing is created until the person completes the form. Google e-mail verification is **not** phone verification and **not** admin approval: a Google-registered worker starts `verificationStatus: pending`, `phoneVerified: false`, exactly like a normal registration.
* Google-registered workers set a password, so User ID / phone / e-mail + password login works as for any worker. Google-registered customers have no password until they use "Forgot password".

## 3. Database changes (additive)

* `users.googleId` (Google `sub`) now has a **partial unique index** (only documents with a string value). It replaces the old plain sparse index automatically at startup (`ensureAuthIndexes`, also run by `npm run migrate:worker-auth -- --fix-indexes`). If duplicate `googleId` values already exist the unique index is **not** created, nothing is deleted or merged, and a clear error is logged.
* `users.googleLinkedAt` (ISO string) - new optional field.
* New collections `googleauthstates` and `googleauthtickets` (hashes only, TTL-expiring). Safe to drop at any time.
* No existing user, password hash or token version is modified by deploying this.

## 4. Removed
`POST /api/auth/customer/google` was removed. It linked by e-mail to any account (including administrators) and returned a session, and when `GOOGLE_CLIENT_ID` was unset outside production it trusted an e-mail sent by the browser. The Google Identity Services script and `VITE_GOOGLE_CLIENT_ID` are no longer used.

## 5. Manual test with real credentials (required before calling this production-ready)
Automated tests use a fake Google. Before going live, with real credentials and on your real HTTPS domain:
1. A Google account whose e-mail has no account -> choose Customer -> signed in. Repeat with Worker (check the profile is *pending*, phone *not* verified).
2. A Google account whose e-mail matches an existing verified customer/worker -> signed in as that same account; password login still works.
3. Cancel on the Google screen -> friendly message. Open the callback URL twice -> second attempt refused.
4. An admin e-mail -> refused.
5. Mobile browser (Chrome/Safari) end to end.
