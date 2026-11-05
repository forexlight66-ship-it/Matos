# MozHyper — Security hardening

Date: 2026-11-05
Branch: `security/backend-hardening-2026-11-05`

## Implemented

- Removed the repository's `public/` directory. Asset files now live in `server-assets/` and are read by backend route handlers.
- `/api/private-assets/*` checks a valid Matos session and serves only a fixed allowlist of dashboard images. Responses are private and non-cacheable.
- `/api/public-assets/*` serves only the icon, web manifest and service worker required by the unauthenticated landing page and PWA. These three resources remain intentionally public; they contain no credentials or user information.
- Added `server-only` guards to server-side OAuth, Deriv identity, database, payment and Telegram modules to prevent accidental imports into client components.
- `/api/auth/token` and `/api/deriv/ws-url` now require a valid Matos session. They validate the Deriv identity against the OAuth refresh token associated with that Matos user.
- Added a stored Deriv `external_reference_id` to bind the server-managed refresh token to the user's Deriv identity. Existing users are rebound from their server-stored refresh token on first use; the browser cookie is not treated as the authority for that association.
- Country updates are locked after registration through the country update endpoint. This prevents changing the stored country after account creation; it does not independently prove a user's country of residence.
- Added database-backed rate limits to login, registration, password recovery, course-code checks, payment requests, withdrawal verification and wallet transfers.
- Added same-origin checks to money-moving and payment-submission POST routes.
- Added browser security response headers: nosniff, frame denial, strict referrer policy, restricted browser permissions and HSTS.
- Added no-store/private caching headers to the authenticated profile response and token/WebSocket responses.
- Reduced the information returned by the public course-code validation endpoint.

## Important boundaries

- A public website must deliver its landing-page icon, web manifest and service worker to unauthenticated browsers. Those files are now delivered by backend routes, but they are still public by design.
- Client-side React components and logic that must run in the browser are still downloadable and inspectable by the user. This change protects server modules and user data; it does not conceal all trading-strategy implementation from someone inspecting their own browser.
- The trading engine has not been moved to a server worker because that would be a separate execution-architecture change requiring a dedicated WebSocket/order lifecycle and Demo validation.
- No security change can guarantee that no third party will ever gain access. Production tests, Render secret review, database access review, dependency audit and monitoring remain necessary.
- Registered country is locked after creation, but the initial country value is still supplied during registration. A separate trusted country-verification mechanism would be needed to treat it as proof of residence.

## Validation required before production

1. Confirm the Render build succeeds with the new server-only boundaries and route handlers.
2. Confirm the unauthenticated landing page, icon, manifest and PWA service worker still work.
3. Confirm unauthenticated requests to `/api/private-assets/*`, `/api/auth/token` and `/api/deriv/ws-url` are denied.
4. Confirm two separate Matos users cannot use each other's Deriv identity, profile, payment request or transfer state.
5. Test payment, withdrawal, OTP and trading connections in Demo before using a real account.
