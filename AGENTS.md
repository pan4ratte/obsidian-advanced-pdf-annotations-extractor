# AGENTS.md — obsidian-extract-pdf-annotations

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | esbuild watch mode (no typecheck) |
| `npm test` | Jest (ts-jest, covers only `extractHighlight`) — 13 tests, all passing |
| `npm run lint` / `npm run lint:fix` | ESLint flat config with the official Obsidian ruleset |
| `npm run build` | `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production` |

## Build quirks

- **Two-phase build**: `tsc` (type-check only) then esbuild (bundle to `main.js`).
- `obsidian`, `electron`, `@codemirror/*`, and node builtins (`node:module`'s
  `builtinModules`) are **externed** — not bundled.
- Output `main.js` is **gitignored**; the release workflow ships it with
  `manifest.json` and `styles.css` — those three files are the plugin.
- Plugin entrypoint: `src/main.ts` → default export `PDFAnnotationPlugin`.
- `obsidian` is pinned to exactly `1.8.7` — it matches `minAppVersion` and is a
  hard peer requirement of `eslint-plugin-obsidianmd`.

## Testing

- Jest with `ts-jest` preset; `obsidian` module mapped to `test/mocks/obsidian.ts`.
  The mock only stubs what importing the code under test evaluates — extend it
  when a test needs more, rather than faking Obsidian behaviour.
- `ANNOTS_TREATED_AS_HIGHLIGHTS` is mocked in test setup.
- Run `npm test` (no watch by default).
- The fixtures are real pdf.js text items and real PDF highlight rectangles for
  the words `diese`, `(S. 1)`, `Word,` and `Lesen`. The single-character cases
  (`W`, `o`, `r`, `d`, `,` of `Word,`) are what pin down the glyph-width
  estimation in `glyphBorders` — if you retune `WIDE_LETTER_WEIGHT` or
  `SLIM_LETTER_WEIGHT`, those are the tests that will tell you.

## Annotation types

`SUPPORTED_ANNOTS` in `src/settings.ts` is the single list of what can be
extracted. The bar for being on it is **carrying text a markdown note can show**:
either PDF text the annotation marks up, or text the reader typed.

pdf.js reports `titleObj`/`contentsObj` for every `MarkupAnnotation` subclass, so
`Ink`, `Square`, `Circle`, `Line`, `Polygon`, `PolyLine`, `Stamp`, `Caret` and
`FileAttachment` are technically readable — they are left out on purpose, because
their content is a drawing, stamp or attached file and their `Contents` is empty
unless a comment happens to be attached, so extracting them produces blank
entries. Don't add them back without a story for what the note would contain.

Two flags drive everything else, so nothing needs updating in parallel:

- `marksUpText` — the four subtypes carrying `QuadPoints` (`Highlight`,
  `Underline`, `Squiggly`, `StrikeOut`, matching pdf.js's own
  `overlaysTextContent`). `ANNOTS_TREATED_AS_HIGHLIGHTS` is derived from it, and
  it decides both whether the PDF text underneath is extracted and whether the
  highlight or the note template is used.
- `desiredByDefault` — derives `DEFAULT_DESIRED_ANNOTATIONS`.

The settings tab renders one checkbox per entry, so adding a subtype is a
one-line change. `desiredAnnotations` is persisted as a list of subtype strings.

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
  settings.test.ts     — desired-annotation toggle round-trip
  mocks/obsidian.ts
styles.css            — settings tab CSS (release asset)
CHANGELOG.md          — release notes source for the workflow
```

## Release

`manifest.json` is the source of truth. `.github/workflows/main.yml` releases
automatically when its `version` changes on the release branch — **no manual
tagging and no `npm version`**; the release creates the tag.

To cut a release, in one commit:

1. Bump `version` in **`manifest.json` and `package.json`** to the same value —
   the workflow fails the run if they disagree
2. Rename `## Unreleased` in `CHANGELOG.md` to that version — the workflow greps
   `## <version>` for the release notes, so a missing section means an empty
   release body
3. Push

The workflow then runs `npm ci` and `npm run build`, attests build provenance for
`main.js` / `manifest.json` / `styles.css`, creates the release with those three
assets, and verifies the attestations. It skips if that version is already
released, so unrelated `manifest.json` edits are harmless.

Lint and tests are **not** gated by the workflow — run `npm run lint` and
`npm test` before pushing.

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
