# Login and Access Tokens

## Endpoints

### POST /auth/login

Accepts a normalized email and a password:

```json
{
  "email": "user@example.com",
  "password": "a sufficiently long password"
}
```

A successful request returns HTTP 200:

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": "15m",
  "user": {
    "id": "<uuid>",
    "email": "user@example.com",
    "name": "User",
    "role": "USER",
    "createdAt": "<timestamp>"
  }
}
```

Unknown emails and incorrect passwords both return HTTP 401 with `Invalid email or password`. The service performs scrypt work for both cases to reduce account-enumeration timing differences. Validation errors return HTTP 400.

### GET /auth/me

Requires `Authorization: Bearer <accessToken>`. It verifies the token signature and expiry, validates the payload, and fetches the current user from PostgreSQL. The response contains `id`, `email`, `name`, `role`, and `createdAt`. Missing, malformed, expired, or invalid tokens return HTTP 401. A token for a deleted account also returns HTTP 401.

## Token Design

Access tokens are signed with `JWT_ACCESS_SECRET` and expire according to `JWT_ACCESS_EXPIRES_IN`. Payload fields are `sub` (user ID), `email`, and `role`; passwords and password hashes are never included.

The current access token is returned in JSON for the frontend to use in the Bearer header. Login also starts the rotating session described in [Refresh Sessions and Logout](./auth-refresh-logout.md).

## Files

- `apps/api/src/auth/dto/login.dto.ts`: login validation and email normalization.
- `apps/api/src/auth/password.service.ts`: scrypt verification with constant-time comparison.
- `apps/api/src/auth/auth.service.ts`: credential validation, token creation, and profile lookup.
- `apps/api/src/common/guards/jwt-auth.guard.ts`: Bearer-token verification.
- `apps/api/src/common/decorators/current-user.decorator.ts`: authenticated token payload access.
- `tests/auth-login.test.cjs`: HTTP and password-verification coverage.

## Verification

Run `npm run quality`. The Jest/Supertest suite covers successful login, normalized email, wrong and unknown credentials, malformed requests, safe responses, valid protected requests, missing/malformed/tampered/expired tokens, invalid payloads, and deleted accounts.

Verified during implementation: all 39 tests and the complete quality gate passed. A real local PostgreSQL smoke test completed signup, normalized-email login, and authenticated `/auth/me`; it also rejected a wrong password and tampered token. The temporary user was deleted and the temporary API was stopped afterward.

## Next Step

Build the Problems module with public reads and admin-protected creation.
