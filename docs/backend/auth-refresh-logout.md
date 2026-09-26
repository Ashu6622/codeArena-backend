# Refresh Sessions and Logout

## Purpose

Keep users signed in without extending the lifetime of access tokens. Access tokens remain short-lived JWTs. Refresh tokens are random opaque values delivered only through an HttpOnly cookie and stored in PostgreSQL only as keyed hashes.

## Database

The `RefreshSession` model records:

- The owning user and a session-family ID.
- A unique HMAC-SHA-256 token hash.
- Expiration, creation, and revocation timestamps.

Deleting a user cascades to their refresh sessions. The migration is `20260911060330_add_refresh_sessions`.

## Cookie

The cookie name is `codearena_refresh`. It uses:

- `HttpOnly` to prevent JavaScript access.
- `SameSite=Lax` to limit cross-site requests.
- `Path=/auth` so it is sent only to authentication routes.
- `Secure` in production.
- An absolute expiry matching the database session.

The frontend must send auth requests with credentials enabled. Local frontend and API ports are same-site on `localhost`. A future cross-site deployment would require an explicit cookie and CSRF design rather than simply changing `SameSite`.

## Endpoints

### POST /auth/login

A successful login still returns the access token and public user in JSON. It now also creates a refresh session and sets the refresh cookie. The raw refresh token is never included in JSON or stored in the database.

### POST /auth/refresh

Reads the HttpOnly cookie, revokes the current session, creates a replacement in the same family, rotates the cookie, and returns a new access token and current public user.

A missing, unknown, expired, revoked, or reused refresh token returns HTTP 401 with `Invalid refresh session`. If a consumed token is reused, every still-active session in that token's family is revoked. The client must log in again.

Rotation uses a database transaction and conditional update. This allows only one concurrent request to consume a session.

### POST /auth/logout

Revokes the session represented by the cookie, clears the cookie, and returns HTTP 204. Logout remains idempotent when the cookie is absent or already invalid.

## Configuration

`JWT_REFRESH_SECRET` keys token hashes and must remain private. `JWT_REFRESH_EXPIRES_IN` controls session and cookie lifetime. Access and refresh expiry values accept a positive integer followed by `s`, `m`, `h`, or `d`. Refresh duration is additionally limited to 365 days.

Changing `JWT_REFRESH_SECRET` invalidates all existing refresh cookies because their hashes can no longer be reproduced.

## Files

- `prisma/schema.prisma`: refresh-session model and user relation.
- `apps/api/src/auth/refresh-token.service.ts`: token creation, hashing, rotation, reuse response, expiry, and revocation.
- `apps/api/src/auth/auth.service.ts`: login and refresh access-token responses.
- `apps/api/src/auth/auth.controller.ts`: cookie handling and refresh/logout routes.
- `tests/auth-refresh.test.cjs`: rotation and logout HTTP tests.
- `tests/auth-login.test.cjs`: login cookie and hashed-storage contract.

## Verification

All 44 Jest/Supertest tests and the complete quality gate passed. A real local PostgreSQL smoke test verified login, rotation, consumed-token reuse detection, family revocation, hashed storage, logout, and post-logout rejection. The temporary account was deleted afterward.

## Limitations and Next Step

There is no UI for viewing or revoking all devices, and expired session cleanup is not scheduled. Those are outside V1's immediate authentication flow.

The next backend feature is the Problems module: public problem listing/details and admin-protected problem creation.
