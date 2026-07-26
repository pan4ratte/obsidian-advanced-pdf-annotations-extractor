# AGENTS.md — obsidian-extract-pdf-annotations

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | esbuild watch mode (no typecheck) |
| `npm test` | Jest (ts-jest, covers only `extractHighlight`) — 3 tests currently fail, see Testing |
| `npm run lint` / `npm run lint:fix` | ESLint flat config with the official Obsidian ruleset |
| `npm run build` | `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production` |
| `npm version <patch\|minor\|major>` then `npm run version` | Bump version in manifest.json + versions.json (no "v" prefix, set via `.npmrc`) |

## Build quirks

- **Two-phase build**: `tsc` (type-check only) then esbuild (bundle to `main.js`).
- `obsidian`, `electron`, `@codemirror/*`, and node builtins (`node:module`'s
  `builtinModules`) are **externed** — not bundled.
- Output `main.js` is **gitignored**; attach to GitHub releases together with
  `manifest.json`, `versions.json` and `styles.css`.
- Plugin entrypoint: `src/main.ts` → default export `PDFAnnotationPlugin`.
- `obsidian` is pinned to exactly `1.8.7` — it matches `minAppVersion` and is a
  hard peer requirement of `eslint-plugin-obsidianmd`.

## Testing

- Jest with `ts-jest` preset; `obsidian` module mapped to `test/mocks/obsidian.ts`.
- Tests only the `extractHighlight` function from `src/extractHighlight.ts`.
- `ANNOTS_TREATED_AS_HIGHLIGHTS` is mocked in test setup.
- Run `npm test` (no watch by default).
- **Known failures**: 3 of the single-letter `extractHighlight` cases are off by
  one letter (`o`→`r`, `r`→`d`, `d`→`d,`). Pre-existing, in the letter-width
  rounding of `roundBasedOnLetterWidths`; not caused by the tooling update.

## Source layout (flat, not a monorepo)

```
src/
  main.ts             — Plugin class, 3 commands, settings load/save
  extractHighlight.ts — PDF text extraction via pdfjs-dist
  formatter.ts        — Handlebars template rendering
  settings.ts         — Settings class + settings tab UI
  types.ts            — PDFFile type, IIndexable helper
test/
  extractHighlight.test.ts
  mocks/obsidian.ts
```

## Release

1. `npm version <bump>` — updates `package.json` version
2. `npm run version` — syncs `manifest.json` + `versions.json`
3. `npm run build` — produces `main.js`
4. Attach `main.js`, `manifest.json`, `versions.json`, `styles.css` to GitHub release

`.github/workflows/main.yml` does this automatically on a pushed tag (`npm ci`,
`npm run lint`, `npm run build`, then a draft release).

## Style

- `.editorconfig`: tabs, indent 4, UTF-8, final newline.
- `eslint.config.mjs` (flat config) extends `eslint-plugin-obsidianmd`'s
  `recommended`, which bundles `eslint:recommended`, typescript-eslint
  `recommended-type-checked`, `import`, `depend` and `no-unsanitized`.
- Lint is **error-free**; the ~226 remaining findings are warnings. Almost all of
  them are the `no-unsafe-*` family firing on the untyped pdfjs annotation
  objects — deliberately warnings while those types get modelled, not accepted
  style. Don't silence them, and don't add new ones.
- Local overrides in `eslint.config.mjs`: `no-unused-vars` on (args: none),
  `ban-ts-comment` off, `no-explicit-any` autofix disabled (its `fixToUnknown`
  fixer rewrites `any` to `unknown` and breaks every call site).
- No inline UI styles — put CSS in `styles.css` and add a class.
- Settings UI: headings via `new Setting(el).setName(...).setHeading()`, sentence
  case for all user-facing text, no plugin name in command names.
