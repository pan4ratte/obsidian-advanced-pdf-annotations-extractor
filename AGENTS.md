# AGENTS.md — obsidian-extract-pdf-annotations

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | esbuild watch mode (no typecheck) |
| `npm test` | Jest (ts-jest) — 187 tests, all passing |
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
- `ANNOTS_TREATED_AS_HIGHLIGHTS` is mocked in `extractHighlight.test.ts`.
- Run `npm test` (no watch by default).
- `loadPDFFile.test.ts` drives the pipeline through a hand-rolled pdf.js stub
  cast to `PDFJsLib`; that interface is small on purpose so this stays possible.
- The glyph fixtures are real pdf.js text items and real PDF highlight rectangles for
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

The settings tab renders one checkbox per entry, labelled with `description`, so
adding a subtype is a one-line change. `desiredAnnotations` is persisted as a
list of subtype strings.

## Templates

One per annotation type over a `defaultTemplate` that covers the types with
none of their own; a blank entry means "use the default". Location is a template
variable, not a setting — `{{filelink}}` renders `[[path]]` inside the vault and
the bare `file://` path outside it, and `{{isExternal}}` is exposed for
templates that need more than the link to differ. `isExternalFile` reaches the
formatter from the command: true only for the clipboard path commands.

## Settings loading

The fork changed the plugin id, so it always starts from a fresh `data.json` and
carries **no migrations** — don't add any for versions of the ancestor plugin.
`loadSettings` copies every declared field, then runs the `normalize*` statics in
`PDFAnnotationPluginSetting` over the ones with a closed set of values. Those
exist for a hand-edited `data.json` and for types added in later versions, not
for upgrades: anything unrecognised falls back to the default.

## Source layout (flat, not a monorepo)

```
src/
  main.ts                     — Plugin class, 7 commands, settings load/save
  extractHighlight.ts         — PDF text extraction via pdfjs-dist
  formatter.ts                — Handlebars template rendering
  settings.ts                 — Settings class + settings tab UI
  advancedExtractionModal.ts  — the "advanced settings" modal
  extractionFilter.ts         — page expressions and the page/date/type filter
  collapsible.ts              — the show/hide animation, shared by tab and modal
  types.ts                    — PDFFile, annotation and pdf.js boundary types
lang/
  en.ts               — every user-facing string, flat UPPER_SNAKE keys
  helpers.ts          — picks the locale, exports `t`
test/
  extractHighlight.test.ts  — glyph-level text extraction
  loadPDFFile.test.ts       — extraction pipeline, against a fake pdf.js
  formatter.test.ts         — template variables and template selection
  settings.test.ts          — annotation types, checkbox round-trip
  extractionFilter.test.ts  — page expressions, days, filtering
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
- Lint is **clean**: 0 errors, and the single remaining warning is
  `prefer-setting-definitions`, which needs Obsidian 1.13's declarative settings
  API and so is out of reach at `minAppVersion` 1.8.7. Keep it that way.
- pdf.js data is typed at the boundary, not passed around as `any`:
  `RawPDFAnnotation` (what pdf.js reports), `PDFAnnotation` (once extraction has
  filled in the note's fields), `PositionedText` and `PDFJsLib` in `src/types.ts`.
  `loadPdfJs()` and `getAnnotations()` return `any` — cast once, there.
- Local overrides in `eslint.config.mjs`: `no-unused-vars` on (args: none),
  `ban-ts-comment` off, `no-explicit-any` autofix disabled (its `fixToUnknown`
  fixer rewrites `any` to `unknown` and breaks every call site).
- No inline UI styles — put CSS in `styles.css` and add a class.
- Settings UI: headings via `new Setting(el).setName(...).setHeading()`, sentence
  case for all user-facing text, no plugin name in command names.
- **No string literals in the UI** — command names, notices, setting names and
  descriptions, the settings header, and the default templates and export names
  (they end up in exported notes) all come from `lang/en.ts`, reached as
  `t.SOME_KEY` via `import { t } from "lang/helpers"`. Flat `UPPER_SNAKE` keys
  grouped under `// ─── Section ───` banners; values are plain strings, and
  anything variable is interpolated at the call site
  (`` new Notice(`${t.NOTICE_COPIED}: ${variable}`) ``). A new language is a
  copy of `en.ts` listed in `helpers.ts`'s `localeMap`.
  Exempt, and to stay exempt: the annotation subtypes (spelled as the PDF format
  spells them), the `{{variable}}` names, the command IDs (persisted, so hotkeys
  survive), and the markdown and YAML syntax the formatter writes.
- `PLUGIN_NAME`/`PLUGIN_DESCRIPTION` duplicate `manifest.json`, which the plugin
  browser reads and no translation can reach. Change both together.
- The lint config uses `obsidianmd.configs.recommendedWithLocalesEn`, which
  sentence-case checks every string in `lang/en.ts` and **bans the disable
  comment** for that rule — there is no exempting a string, so write UI text
  that passes. Two consequences worth knowing before adding a string:
  - Write each one as a **single literal**. The rule walks object properties and
    skips `"a" + "b"`, so a concatenated string is silently unchecked.
  - No sentence fragments. Text that wraps a link is one whole sentence rendered
    by `appendTextWithLink`, and a message that varies by case gets one complete
    sentence per case (see `notices.templatesCollapsed`) rather than a word
    spliced into a shared one.
  - Proper nouns go in the rule's `ignoreWords` in `eslint.config.mjs`, which is
    where `Handlebars` and the annotation subtypes live.
