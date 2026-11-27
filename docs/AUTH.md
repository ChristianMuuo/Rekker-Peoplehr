# Authentication & Session Security (`AUTH.md`)

## 1. First-Party Session Authentication
- **Password Hashing**: Native Node.js `crypto.argon2` (`argon2id`, memory `19456` KiB, passes `2`, parallelism `1`, `16`-byte random salt, `32`-byte tag) verified via `crypto.timingSafeEqual`.
- **Sessions**: `POST /api/auth/login` verifies credentials against `peopleos_users` (with 5-attempt lockout for 15 minutes), creates a session in `peopleos_user_sessions` storing a SHA-256 hash of the 32-byte random token, and sets:
  - `peopleos_sid`: `HttpOnly; SameSite=Lax; Path=/` (`Secure` in `production`)
  - `peopleos_csrf`: CSRF token cookie
- **Logout & Reset**:
  - `POST /api/auth/logout` revokes the session (`revokedAt`) and clears cookies.
  - `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` use time-limited SHA-256 token hashes.
  - `GET /api/auth/me` validates the active session cookie.

## 2. Demo & Sandbox Isolation
- Header-based role simulation (`x-peopleos-role`, `x-peopleos-user-id`) is strictly blocked (`403 DEMO_HEADERS_FORBIDDEN`) whenever `NODE_ENV=production` or `CLERK_SECRET_KEY` is set.
- Public/staging deployments can set `DEMO_PASSCODE` to require cookie/header verification via `POST /api/demo-access` (`/access` page).
