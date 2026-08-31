# Passkey owner sign-in (Touch ID)

Date: 2026-09-01

## Goal

Let the owner sign in with the Mac fingerprint sensor instead of typing the
passphrase, with the passphrase kept as the recovery path. Fingerprint is the
default: on a browser that has registered before, the sign-in modal fires the
Touch ID prompt the moment it opens.

## Why WebAuthn

Safari and Chrome on macOS expose Touch ID through the WebAuthn standard. The
fingerprint never leaves the machine; the browser returns a signature over a
server-issued challenge. No native app, no extra platform dependency.

`@simplewebauthn/server` and `@simplewebauthn/browser` do the verification.
Hand-rolling it means CBOR decoding, COSE key parsing and ECDSA verification,
which is the wrong thing to write by hand at an auth boundary.

## Storage

One new Supabase table. This is the architecture decision CLAUDE.md rule 4
flags, taken deliberately: a credential must survive redeploys and the owner
registers more than one device.

```sql
create table public.webauthn_credentials (
  credential_id text primary key,
  public_key    text not null,          -- base64url
  counter       bigint not null default 0,
  transports    text[] not null default '{}',
  device_label  text not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
```

No `user_id` column. There is one owner, so the whole table is theirs.
Inventing a users table for a single owner would misdescribe the app.

## Challenges stay stateless

WebAuthn needs a random challenge issued in step one and checked in step two.
Rather than a second table, the challenge rides in a 2 minute HMAC-signed
HttpOnly `webauthn_challenge` cookie signed with the existing
`AUTH_SESSION_SECRET`. This reuses the mechanism `utils/auth.ts` already
implements for sessions, so it adds no new concept.

## Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET/POST /api/webauthn-register` | Session | GET issues creation options, POST verifies and stores |
| `GET/POST /api/webauthn-login` | None | GET issues request options, POST verifies and mints the session |
| `GET/DELETE /api/webauthn-credentials` | Session | List and revoke |

A successful passkey login mints the same `dashboard_session` cookie
`login.ts` mints today, so `isAuthorized`, `requireAuth` and every downstream
function are untouched.

## WebAuthn configuration

- `userVerification: 'required'` forces a real biometric rather than mere user
  presence, so it is Touch ID and not just a click.
- `allowCredentials: []` at login lets the browser offer whatever passkey it
  holds for the origin. That is why there is no username field anywhere.
- `residentKey: 'preferred'` so the credential is discoverable.
- New env vars `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN`. Production and
  localhost are different origins, so they hold separate registrations. That
  is inherent to WebAuthn, not a shortcut.

## Sign-in flow

1. Modal opens. If the browser supports WebAuthn, a platform authenticator is
   available, and this browser has registered before (localStorage hint), it
   fires Touch ID immediately.
2. Success mints the session and the app loads.
3. Cancel, failure or no registration drops to a "Sign in with Touch ID"
   button, with "Use passphrase instead" below it.
4. The passphrase form is unchanged from today.

The localStorage hint is UX only, never a security boundary. The server
decides every outcome.

## Registration

- After a passphrase login on a browser with no hint, a one-time dismissible
  card offers to set up Touch ID. Dismissal is remembered.
- A Passkeys panel beside the Logout button lists registered devices with
  their label and last-used date, and removes them.
- `device_label` is derived from the user agent at registration
  ("macOS, Safari"), so the list is readable without asking for input.

## Error handling

| Case | Behaviour |
|---|---|
| No WebAuthn support or no platform authenticator | Fingerprint path never shown, passphrase only |
| User cancels the OS sheet (`NotAllowedError`) | Not an error. Falls back to the button quietly |
| Server does not recognise the credential | Clear the hint, drop to passphrase, explain the device was removed |
| Challenge cookie expired | Show "that took too long, try again". Not retried automatically: a silent retry would re-open the OS sheet the owner had walked away from |
| Counter regression on a non-zero counter | Reject the login. Apple returns 0 always, so 0 is treated as unsupported rather than a failure |

## Testing

Vitest, alongside the existing `netlify/functions/utils/auth.test.ts`.

- Challenge cookie: round trips, rejects tampering, rejects expiry.
- Register: rejects unauthenticated callers, rejects a mismatched challenge.
- Login: rejects an unknown credential id, rejects counter regression, mints
  the session on success.
- Device label derivation and the "should we auto-prompt" decision are pure
  functions, tested without a DOM.

SimpleWebAuthn's own signature verification is not re-tested. That is the
dependency's job.

## Out of scope

- Passkeys as a second factor. This is fingerprint OR passphrase, for
  convenience, not 2FA.
- Cross-origin credential sharing between localhost and production.
