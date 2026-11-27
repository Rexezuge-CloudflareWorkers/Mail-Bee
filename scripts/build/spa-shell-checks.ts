/**
 * The rules behind `scripts/build/verify-spa-shell.ts`.
 *
 * Pure and exported so every check is testable without a build on disk. The
 * filesystem side is a few `existsSync`/`readFileSync` calls in the entrypoint,
 * and none of that is where the risk lives — the risk is knowing which of the
 * ways a shell can be wrong to look for.
 */

/**
 * A built shell is a full Vite `index.html`. The `postinstall` stub is
 * `SPA_HTML: string = ''`. Any threshold works; this one only has to reject an
 * obviously empty value.
 */
export const MIN_HTML_BYTES = 200;

/**
 * The prefix the generated module declares `SPA_HTML` with.
 *
 * Exact rather than a regex: the generated file is ours, and matching the literal
 * means a change to the plugin's output shape is reported as "does not export
 * SPA_HTML — regenerate it" instead of decoding whatever now sits in its place.
 */
export const SPA_HTML_MARKER = 'export const SPA_HTML: string = ';

/**
 * What a problem is, and why it matters. A message the operator cannot act on is
 * half a failure: they are looking at a blank page and need to know it is a build
 * they did not run.
 */
export interface ShellProblem {
  readonly code:
    | 'missing'
    | 'unexported'
    | 'stub'
    | 'malformed'
    | 'too-small'
    | 'no-assets'
    | 'missing-asset'
    | 'dist-missing'
    | 'disagreement'
    | 'missing-css'
    | 'missing-tailwind-utility';
  readonly detail: string;
}

/**
 * The assets the embedded shell references, in document order and deduped.
 *
 * Only same-origin `/assets/` paths count. An absolute URL to another host is not
 * something `apps/web/dist/assets` can be expected to hold, and checking it would
 * report a false problem on a shell that is perfectly correct.
 */
export function referencedAssets(html: string): string[] {
  const found = html
    .matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)
    .map((match) => match[1])
    .toArray();
  return new Set(found).values().toArray();
}

/**
 * Decodes the `SPA_HTML` string literal out of the generated module.
 *
 * Returns the problems rather than the HTML, because every failure here is a
 * distinct operator action and collapsing them into `null` would make the reason a
 * blank page depend on which message happened to be built first.
 */
export function readEmbeddedHtml(source: string): { html: string | null; problems: ShellProblem[] } {
  const at = source.indexOf(SPA_HTML_MARKER);
  if (at === -1) {
    return {
      html: null,
      problems: [
        {
          code: 'unexported',
          detail: `apps/api/src/generated/spa-shell.ts does not export SPA_HTML — regenerate it with \`pnpm --filter @mail-bee/web build\`.`,
        },
      ],
    };
  }

  const literal = source
    .slice(at + SPA_HTML_MARKER.length)
    .replace(/;\s*$/, '')
    .trim();

  // The `postinstall` stub is `SPA_HTML: string = ''`, which `JSON.parse` rejects,
  // so it is recognised before the parse rather than reported as malformed. It is
  // the most common failure by far — a fresh clone that never ran the build — and
  // it deserves the actionable message.
  if (literal === "''" || literal === '""') {
    return {
      html: null,
      problems: [
        {
          code: 'stub',
          detail:
            'apps/api/src/generated/spa-shell.ts still holds the empty postinstall stub — run `pnpm --filter @mail-bee/web build`. ' +
            'Until then every browser navigation served by the API worker is a blank page.',
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(literal);
  } catch {
    return {
      html: null,
      problems: [
        {
          code: 'malformed',
          detail: 'apps/api/src/generated/spa-shell.ts is not the generated shape — delete it and run `pnpm --filter @mail-bee/web build`.',
        },
      ],
    };
  }

  if (typeof parsed !== 'string') {
    return {
      html: null,
      problems: [
        {
          code: 'malformed',
          detail: `apps/api/src/generated/spa-shell.ts holds ${typeof parsed}, not a string — regenerate it with \`pnpm --filter @mail-bee/web build\`.`,
        },
      ],
    };
  }

  if (parsed.length < MIN_HTML_BYTES) {
    return {
      html: null,
      problems: [
        {
          code: 'too-small',
          detail:
            `apps/api/src/generated/spa-shell.ts holds no usable HTML (${parsed.length} chars) — run \`pnpm --filter @mail-bee/web build\`. ` +
            'Until then every browser navigation served by the API worker is a blank page.',
        },
      ],
    };
  }

  return { html: parsed, problems: [] };
}

/**
 * The problems with a shell, given what is on disk.
 *
 * Three independent failures are all "the build is not what you think it is", and
 * all three are checked: a shell can decode cleanly, reference assets that are
 * absent, and disagree with `dist/index.html` at the same time.
 *
 * @param shellSource the generated module's text, or `null` when it does not exist.
 * @param distIndex the built `index.html`'s text, or `null` when `dist/` does not exist.
 * @param assetExists called per referenced asset name.
 */
export function checkShell(shellSource: string | null, distIndex: string | null, assetExists: (name: string) => boolean): ShellProblem[] {
  if (shellSource === null) {
    return [
      {
        code: 'missing',
        detail: 'apps/api/src/generated/spa-shell.ts is missing — run `pnpm --filter @mail-bee/web build` to generate it.',
      },
    ];
  }

  const { html, problems } = readEmbeddedHtml(shellSource);
  if (html === null) {
    return problems;
  }

  // Every same-origin asset the shell references must exist in `dist/assets`. A
  // missing one means the served page loads with no JS (or no CSS), so the SPA
  // silently renders nothing at all — which is why the asset check cannot be
  // folded into the `dist/index.html` comparison below.
  const assets = referencedAssets(html);
  if (assets.length === 0) {
    // Unlike the empty postinstall stub, a plausible-looking page with no bundle
    // references clears every other check here: it is over `MIN_HTML_BYTES`, it
    // parses, and it is not the `''` stub. Without this it would be deployed as a
    // valid-looking page that never loads the SPA.
    problems.push({
      code: 'no-assets',
      detail:
        'The embedded shell references no /assets/ bundles, so it loads no JavaScript and the SPA renders nothing. ' +
        'Run `pnpm --filter @mail-bee/web build`; a shell without bundles was never emitted by Vite.',
    });
  }
  for (const asset of assets) {
    if (!assetExists(asset)) {
      problems.push({
        code: 'missing-asset',
        detail: `The embedded shell references /assets/${asset}, which is not in apps/web/dist/assets — run \`pnpm --filter @mail-bee/web build\`.`,
      });
    }
  }

  // The Vite plugin writes a verbatim copy of `dist/index.html`, so a disagreement
  // means only one half of the build was refreshed — which reads as "I built it"
  // and is the failure that survives a clean-looking shell.
  if (distIndex === null) {
    problems.push({ code: 'dist-missing', detail: 'apps/web/dist/index.html is missing — run `pnpm --filter @mail-bee/web build`.' });
  } else if (distIndex !== html) {
    problems.push({
      code: 'disagreement',
      detail: 'apps/api/src/generated/spa-shell.ts does not match apps/web/dist/index.html — run `pnpm --filter @mail-bee/web build`.',
    });
  }

  return problems;
}

/**
 * The Tailwind utilities the SPA cannot ship without, one per reported symptom so
 * a failure names something a reader can see on screen. Mail-Bee's SPA uses the
 * kit's `NoticeBar` and `Unauthorized`, whose classes are scanned from
 * `@rexezuge/web`'s bundle by the `@source` line in `globals.css`: the notice
 * loses its screen-reader prefix, centring, background and width clamp without
 * these four, and the Unauthorized action loses its focus ring without the
 * remaining three.
 *
 * These are deliberately *not* the utilities the app writes itself (its spinner,
 * accent button and error background): those would be emitted even with the kit's
 * `@source` line deleted, so they cannot measure whether the kit is styled.
 *
 * **Every token here must appear nowhere under `apps/web/`.** Tailwind's scan root
 * is the Vite root, so it reads *Markdown as well as JSX* — a class name written in
 * a guide under that root is a class name the scanner finds, and Tailwind emits it
 * whether or not the kit is a source. `test/scripts/spa-shell-checks.test.ts`
 * asserts the property, so the next person to document a utility finds out from
 * the suite rather than from a gate that has quietly stopped measuring.
 *
 * Matched as class *selectors* — see `checkCss`.
 */
export const KIT_REQUIRED_CSS_TOKENS: readonly string[] = [
  'sr-only',
  '-translate-x-1/2',
  'max-w-[calc(100vw-2rem)]',
  'bg-[var(--color-surface-2)]',
  'focus-visible:outline-2',
  'focus-visible:outline-offset-2',
  'focus-visible:outline-[var(--color-accent)]',
];

/**
 * The problems with the built CSS bundle.
 *
 * `css` is the bundle text, or `null` when no bundle exists. A missing bundle is a
 * build that did not run; a bundle missing one of the kit tokens means `globals.css`
 * lost its `@source` line, so only half the kit is styled.
 *
 * Each token is matched as a class **selector**, never as a bare substring. A bare
 * match is satisfied by a theme variable of the same shape — Tailwind emits custom
 * properties from its theme whether or not anything uses them — so a substring
 * check would call an unstyled control present. The leading `.` is what a generated
 * utility always has and a custom property never has. Backslashes are stripped
 * from both sides first, so the escape form
 * (`.max-w-\[calc\(100vw-2rem\)\]`) and the plain token agree.
 *
 * The remediation message names the *file* and the *package*, never the path. It
 * used to quote the `@source` line verbatim, which meant that changing the form of
 * that line — a glob to a directory, say — left the operator being told to restore
 * text that no longer existed anywhere in the repo. A gate that reports the wrong
 * fix is worse than no gate: it gets acted on.
 */
export function checkCss(css: string | null): ShellProblem[] {
  if (css === null) {
    return [
      {
        code: 'missing-css',
        detail: 'No CSS bundle found in apps/web/dist/assets — run `pnpm --filter @mail-bee/web build`.',
      },
    ];
  }
  const selectors = css.replaceAll('\\', '');
  const missing = KIT_REQUIRED_CSS_TOKENS.filter((token) => !selectors.includes(`.${token.replaceAll('\\', '')}`));
  if (missing.length === 0) {
    return [];
  }
  return [
    {
      code: 'missing-tailwind-utility',
      detail:
        'The built CSS is missing the kit primitive utilities ' +
        missing.map((token) => `\`${token}\``).join(', ') +
        ' — these only compile when ' +
        'the `@source` line for `@rexezuge/web` in `globals.css` is present. Without it every shared control ships without styling. ' +
        'Run `pnpm --filter @mail-bee/web build` after restoring the line.',
    },
  ];
}
