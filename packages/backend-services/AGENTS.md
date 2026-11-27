# packages/backend-services

Business logic. Keep the composition root (`composition/tokens.ts`, `composition/requestScope.ts`) in sync when adding a service: declare its env interface, add a token, bind a factory, and extend `RequestScopeEnv` so a missing binding fails typecheck. Only tokens a route, workflow or registered cron task actually resolves belong there — the Mail-Otter AI/action/digest/integration/chat services were removed rather than left bound but unused; do not reintroduce them.

Product areas:

- `user` + `identity` — resolve the Access email to an account; `AccountIdentity` carries `id`, `email` (current sign-in) and `anchorEmail` (frozen).
- `application` — create/list/delete user-owned OAuth applications; credentials encrypted at rest.
- `oauth2` — state + PKCE sessions, token exchange/refresh through the DO, encrypted KV cache.
- `subscription` — Gmail watch / Graph subscription creation, renewal and stop.
- `webhook` — validate provider secrets and enqueue notifications.
- `forwarding` — the Mail-Bee feature. `ForwardingService` resolves the account, fetches raw MIME through `provider-clients`, rebuilds the top-level headers with `buildForwardedMime` (body stays byte-for-byte), sends it through `env.EMAIL`, and records the outcome.

Token-adjacent code must use `logTokenAdjacentError` and never interpolate a caught provider/OAuth error into a log line.
