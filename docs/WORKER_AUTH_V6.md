# Worker authentication, profile editing and recovery (V6)

## What workers see
* **Register:** Full Name, User ID, Phone, optional Email, Password + Confirm (min 6), consent checkbox, plus the existing profile fields.
  * With an email: the existing 6-digit email OTP verification is unchanged (no session until verified).
  * Without an email: nothing to verify; the account is created and logged in at once. The profile is still **pending admin approval**; the phone is **not** marked verified.
* **Login:** one box - User ID, phone (any common format) or verified email - plus password. All resolve to the same account.
* **Profile edit:** session based (own profile only; any worker id sent by the client is ignored). The phone number is read-only; changing it is a request an admin verifies.
* **Forgot password:**
  * *I have an email* - existing email-code flow (workers need a **verified** email).
  * *I don't have an email* - the worker submits User ID/phone, gets a reference number (`NOW-XXXXXXXXXX`) and can check a coarse status.

## Admin-assisted recovery (no email)
1. Admin opens **Recovery Requests** (admin only). Phone numbers are masked; "Show phone number" reveals one and is audit-logged.
2. Admin phones the worker and verifies identity, ticks the confirmation and **Approve**s (the server refuses without it).
3. **Generate reset link**: random 256-bit token, only its SHA-256 hash is stored, valid `RECOVERY_LINK_TTL_MINUTES` (default 30), single use. The raw link is returned once to that admin and never listed or logged. Generating another link voids the previous one.
4. **Send Reset Link on WhatsApp** opens `wa.me/91<number>?text=...` with a ready message (Tanglish / Tamil / English templates live in `src/i18n/translations.ts`: `recovery_wa_message_*`). **The admin must press Send.** The app cannot tell whether WhatsApp actually sent or delivered it; this is a manual workflow, not the WhatsApp Business API.
5. The worker opens `https://<PUBLIC_APP_URL>/reset-password#token=...` (token in the URL fragment, removed from the address bar), sets a new password (min 6). The request becomes **Completed only then**; all other sessions are signed out.

No SMS and no paid API is used. Admins can never see passwords or hashes. If the worker has neither email nor reachable WhatsApp: do not reset unless the admin can establish ownership (in-person visit / ID / video call); otherwise reject the request.

## Phone numbers
Valid format (10-digit Indian mobile, +91/0 prefixes normalised) and uniqueness are enforced; **format-valid does not mean verified**. "Profile approved" (`verificationStatus`) and "Phone verified" (`phoneVerified`, admin-set) are separate. A phone change is a request (`POST /api/workers/phone-change`, needs the password); an admin approves after calling the new number. The User ID never changes.

## Security notes
* Passwords: scrypt (unchanged). Confirm Password is only compared, never stored.
* Worker login: per-IP limiter + per-account lockout (8 failures / 15 min) with a generic error and equal-cost dummy hash for unknown accounts.
* Recovery requests: per-IP limiter, merged duplicates, max 3/day/identifier; unknown identifiers get a hidden decoy record so the reference number and status look identical (decoys auto-expire after 14 days).
* Reset: atomic single-use consumption; expiry; revoke on regenerate/reject.
* Audit log: who approved / generated a link and when; never tokens or passwords.

## Migration (existing workers) - nothing runs automatically except an index fix
There was no 4-digit PIN in this codebase. Existing workers have **email + password** accounts and keep logging in with them.

1. **Back up the database.**
2. `npm run migrate:worker-auth` - **dry run**, prints the plan and writes nothing.
3. `npm run migrate:worker-auth -- --apply` - assigns each worker a unique User ID (shown in their dashboard) and copies their phone into the login field when unambiguous. Duplicate / invalid phones are listed and left unset for an admin to resolve. It never deletes data, changes passwords/emails or marks anything verified.

On startup the server also replaces the legacy plain-unique `users.email` index with a partial unique index (index-only, no documents touched) so several workers may have no email.
Old passwords shorter than 6 characters keep working; new passwords must be at least 6.
