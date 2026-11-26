# Tests

`pnpm run test` runs the Node/Vitest suite from `test/`; `pnpm run test:coverage` enforces the floors in `vitest.config.mts`; `pnpm run test:web` runs the jsdom SPA suite.

Aliases for workspace packages and `cloudflare:*` modules come from `@rexezuge/tooling`. The `cloudflare:email` mock lives in `test/mocks/cloudflare-email.ts`; it exposes the envelope addresses and raw MIME so `ForwardingService` sends can be asserted.

Mock DAOs at their package subpath (`vi.mock('@mail-bee/backend-data/dao', ...)`) and provider utilities the same way. Do not build a live D1 or call provider APIs in unit tests. Webhook tests assert the enqueued queue message; forwarding tests assert the `EMAIL.send` arguments and the `processed_messages` outcome.
