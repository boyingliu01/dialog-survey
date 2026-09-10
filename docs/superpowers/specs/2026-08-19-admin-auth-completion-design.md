# Admin Authentication Completion Design

## Goal

Complete the existing single-administrator login feature so that every interview-management page and mutation is protected by an authenticated session or the supported admin API key, browser mutations enforce CSRF validation, and the documented session behavior matches the implementation.

This work preserves the current uncommitted GET/HEAD redirect fix. It does not introduce multiple administrators or application-managed credentials.

## Current State

The project already has a login page, bcrypt password verification, encrypted secure-session cookies, logout, an admin API-key fallback, and authenticated-user display. The committed middleware still exempts every GET, HEAD, and OPTIONS request before authentication, which exposes data-bearing admin pages. The current worktree removes that exemption and adds redirect tests.

CSRF tokens are generated in templates but never validated because `fastify.csrfProtection` is not attached to routes or hooks. The admin layout also reads a nonexistent `csrf-token` cookie rather than a generated request token. The current password-change route only mutates `process.env`, so its success is lost after restart.

## Scope

### Included

- Preserve and complete session-based browser authentication.
- Preserve `X-Admin-Key` compatibility for administrative scripts.
- Redirect anonymous GET and HEAD admin-page requests to `/admin/login`.
- Reject unauthenticated admin mutations with HTTP 401.
- Delete expired sessions during authentication.
- Implement inactivity expiration using `lastActivity`.
- Enforce CSRF validation on browser login, logout, and admin mutations.
- Render a generated CSRF request token into the login page and authenticated admin layout.
- Send the rendered token with ordinary forms and global HTMX requests.
- Remove the non-durable online password-change UI and routes.
- Document deployment-managed password rotation.
- Add unit, route, and browser-level regression coverage.
- Make authentication E2E setup and cleanup tolerate slow browser startup and partial setup failure.

### Excluded

- Administrator database models or Prisma migrations.
- Multiple administrators, roles, account recovery, or password-reset email.
- Writing credentials back to `.env` or another deployment file.
- Changes to the unrelated `VERSION` rollback.
- Generated `reports/*.xlsx` files.

## Authentication Architecture

`adminAuth` is the single authorization boundary for protected admin routes.

1. Read the encrypted admin session.
2. If the session is valid and not idle-expired, attach `request.user`, refresh `lastActivity`, and continue.
3. If an expired session exists, delete it.
4. If `X-Admin-Key` is present, compare it with configured `ADMIN_API_KEY`. A match authenticates the request. A missing server-side key or mismatch returns an authentication error.
5. If no API-key credential was presented, redirect GET and HEAD requests to `/admin/login`; reject other methods with HTTP 401.

This ordering lets browser-only deployments use username/password authentication without requiring `ADMIN_API_KEY`, while retaining explicit API-key compatibility.

OPTIONS requests remain the responsibility of Fastify CORS/preflight handling rather than being treated as authenticated admin content requests.

## Session Semantics

An admin session contains `userId`, `role`, `loginTime`, and `lastActivity`.

- Expiration compares the current time with `lastActivity`.
- Successful validation updates `lastActivity`.
- `loginTime` remains immutable audit metadata.
- Invalid or expired sessions are removed before the response is returned.

The configured `SESSION_MAX_AGE` therefore means maximum inactivity duration, matching project documentation.

## CSRF Design

The server continues using `@fastify/csrf-protection` with secure-session storage. Registration alone is insufficient, so state-changing browser routes attach `fastify.csrfProtection` at `preHandler`, after form bodies are available.

The CSRF request token comes only from `reply.generateCsrf()`:

- `GET /admin/login` renders it into the login form's `_csrf` hidden field.
- `GET /admin` renders it into the logout form and a meta element used by HTMX.
- The global HTMX hook reads the rendered meta token and sends it as `x-csrf-token`.

The browser never treats the `_csrf` secure-session value or a cookie as the request token.

Protected mutations accept one of two deliberate authentication modes:

- Browser session: requires a valid session and a valid CSRF token.
- Explicit `X-Admin-Key`: remains available for non-browser automation without requiring browser CSRF state.

The implementation will centralize this policy so routes do not independently drift between the two modes.

## Password Management

The application remains a deployment-managed, single-administrator system. The following are removed:

- The top-bar "修改密码" action.
- `GET /admin/content/change-password`.
- `POST /admin/change-password`.
- The change-password fragment template.
- Tests that imply process-local password mutation is durable.

Password rotation is documented as an operational procedure: generate a bcrypt hash, update `ADMIN_PASSWORD_HASH` through the deployment's secret/configuration mechanism, and restart or roll the service. The application must never report a durable password change when it only mutated process memory.

## Error Behavior

- Anonymous page navigation: 302 to `/admin/login`.
- Anonymous admin mutation: 401 HTML response suitable for existing HTMX handling.
- Presented but invalid admin API key: 401.
- Presented API key when `ADMIN_API_KEY` is not configured: configuration error without exposing secret material.
- Missing or invalid CSRF token on a browser mutation: 403.
- Invalid username/password: 401 with the existing generic error message.
- Missing username/password configuration: 500 with the existing operator-facing message.

No response or log includes credential values, password hashes, session contents, or CSRF secrets.

## Testing Strategy

Tests follow red-green-refactor and cover observable behavior.

### Unit

- Session validity uses `lastActivity` rather than `loginTime`.
- Successful validation refreshes activity.
- Expired sessions are rejected.
- `adminAuth` redirects anonymous GET/HEAD requests.
- Anonymous mutations receive 401.
- Valid sessions and valid API keys pass.
- Missing `ADMIN_API_KEY` does not break browser redirects when no API-key header is supplied.

### Route Integration

- Login and logout reject missing or invalid CSRF tokens.
- A generated token permits valid login and logout.
- Admin shell rendering includes the generated token.
- HTMX mutation requests with a valid session and token succeed.
- API-key automation follows the explicitly selected CSRF policy.
- Removed password-change routes return 404.

### Browser E2E

- Anonymous `/admin` navigation lands on the login page.
- Valid credentials open the interview-management shell and display the user.
- Logout returns to login and the old session no longer grants access.
- A representative HTMX mutation succeeds with the rendered CSRF token.
- Tokenless browser mutation is rejected.

E2E setup uses an adequate hook timeout for the measured environment. Cleanup checks each resource before closing it so a setup timeout cannot hide the original failure with an undefined-resource error.

## Verification

The implementation is complete only when:

- Authentication unit and route tests pass.
- Authentication Playwright E2E scenarios execute rather than skip.
- TypeScript type checking passes.
- Biome checks pass.
- A runtime HTTP check confirms anonymous `/admin` redirects to `/admin/login`.
- A runtime authenticated check confirms the admin shell renders.
- A tokenless browser mutation returns 403.
- `git diff --check` passes.
- The authentication diff excludes `VERSION` and generated report workbooks.

## Rollout

No database migration is required. Deployments must already provide `SESSION_SECRET`, `SESSION_SALT`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD_HASH`. `ADMIN_API_KEY` remains optional unless API-key automation is used. Existing secure sessions may be invalidated if deployment secrets change, which is acceptable for an authentication hardening release.
