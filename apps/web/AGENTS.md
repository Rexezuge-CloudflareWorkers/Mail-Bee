# apps/web

Vite + React dashboard. `src/App.tsx` is the composition root: kit `Unauthorized` gate, notice bar, connect form, mailbox cards and forwarding log.

Rules:

- No `@mail-bee/*` imports; only `@rexezuge/web` and local modules.
- Plain English strings, no i18n catalogues.
- API helpers in `src/lib/api.ts` use same-origin paths under `/user`.
- Do not add dependencies without updating `package.json` and the lockfile.
- `vite.config.ts` generates `apps/api/src/generated/spa-shell.ts` on build; `src/globals.css` keeps the `@source` line so kit component classes survive Tailwind's scan.
