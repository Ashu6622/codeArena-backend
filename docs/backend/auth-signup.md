# Signup

## Endpoint

`POST /auth/signup` creates a user and returns HTTP 201. It does not log the user in or issue tokens.

```json
{
  "email": "user@example.com",
  "password": "a sufficiently long password",
  "name": "User"
}
```

Email is required, validated, trimmed, lowercased, and limited to 254 characters. Password is required and must contain 15 to 128 characters; it is not trimmed or normalized. Name is optional; if provided it must be a string with 1 to 80 characters after trimming. Null values and unknown fields such as role are rejected.

The response contains only `id`, `email`, `name`, `role`, and `createdAt`. The database default sets the role to USER. Passwords and hashes are never selected for the response.

## Behavior

- HTTP 400: invalid, missing, or unexpected fields.
- HTTP 409: email already exists, including concurrent signup attempts.
- HTTP 500: unexpected server failure, without exposing database details.

Emails are normalized before insertion. PostgreSQL's existing unique email constraint handles duplicates atomically. Other writers must use the same normalization policy; the existing schema does not enforce case folding for direct SQL inserts.

Passwords use asynchronous Node.js scrypt with N=32768, r=8, p=3, a random 16-byte salt, and a 64-byte derived key. Stored format is `scrypt$N$r$p$saltHex$keyHex`, preserving parameters for future login verification.

## Files

- `apps/api/src/auth/dto/signup.dto.ts`: validation and normalization.
- `apps/api/src/auth/auth.controller.ts`: signup route with explicit DTO validation for the tsx development runner.
- `apps/api/src/auth/auth.service.ts`: user creation and duplicate handling.
- `apps/api/src/auth/password.service.ts`: password hashing.
- `apps/api/src/auth/auth.module.ts`: dependency wiring.
- `tests/signup.test.cjs`: Jest and Supertest coverage.

## Verification

`npm test` compiles the TypeScript application and runs HTTP tests with a mocked Prisma service, plus real password-hashing checks. It does not require a database. Tests cover validation, normalization, optional names, hashing, response selection, duplicate handling, and unexpected failures.

Run `npm run quality` for the existing pre-commit checks. Signup tests are also included in that quality gate.

Verified: all 17 Jest tests and the full quality gate passed. A local PostgreSQL smoke check using the tsx runner confirmed validation, persisted password hashes, public response fields, and concurrent case-normalized duplicates returning one 201 and one 409. The uniquely named test user was deleted and the temporary API stopped afterward.

## Remaining Authentication Work

Login, token issuance, refresh sessions, logout, and protected routes are separate steps. Email verification and signup rate limiting are not implemented in this feature.

## References

- [Node.js scrypt documentation](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)
- [NestJS validation](https://docs.nestjs.com/techniques/validation)
