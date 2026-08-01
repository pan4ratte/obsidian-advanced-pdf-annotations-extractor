# AGENTS.md — classy-pdf-extractor

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | esbuild watch mode (no typecheck) |
| `npm test` | Jest (ts-jest) — 192 tests, all passing |
| `npm run lint` / `npm run lint:fix` | ESLint flat config with the official Obsidian ruleset |
| `npm run build` | `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production` |

## Build quirks

- **Two-phase build**: `tsc` (type-check only) then esbuild (bundle to `main.js`).
- `obsidian`, `electron`, `@codemirror/*`, and node builtins (`node:module`'s
  `builtinModules`) are **externed** — not bundled.
- Output `main.js` is **gitignored**; the release workflow ships it with
  `manifest.json` and `styles.css` — those three files are the plugin.
- Plugin entrypoint: `src/main.ts` → default export `PDFAnnotationPlugin`.
- `obsidian` is pinned to exactly `1.13.1` — it matches `minAppVersion` 1.13.0,
  which the declarative settings tab needs. `eslint-plugin-obsidianmd` still
  peer-requires exactly `1.8.7`, so `package.json` overrides that peer to
  `$obsidian`; without the override `npm install` fails with `ERESOLVE`. Drop
  the override once a release of that plugin widens the peer.
- **After changing the `obsidian` version, run `npm ls obsidian` and restart the
  editor's TypeScript server.** Two things go wrong quietly here:
  - `npm install` will not re-resolve a nested copy the lockfile already holds,
    so the plugin's own `node_modules/obsidian` can be left behind at the old
    version. `npm ls` then exits `ELSPROBLEMS` with `invalid:`. Delete the
    nested directory *and* its `package-lock.json` entry, then install again.
  - `noImplicitAny` is **false**, so an `obsidian` that does not resolve is not
    an error — every import from it silently becomes `any`. It surfaces as
    ~90 `no-unsafe-assignment` warnings spread over every file that imports
    from `obsidian`, starting at `lang/helpers.ts:12` and including
    `collapsible.ts` (which needs the global `HTMLElement` augmentation). It
    reads like a code problem and is not one: `tsc` and `npm run lint` from a
    fresh `npm ci` are the check that settles it. An editor that had the
    package swapped underneath it will keep reporting them until its TS server
    is restarted.
  - The same thing on a **whole uninstalled tree** — a CI job or review bot
    that lints without `npm ci` — is the full-blown version: `obsidian`,
    `pdfjs-dist` and `handlebars` all resolve to nothing and ESLint reports
    **~815 warnings across eight files** (`settings.ts` 472,
    `advancedExtractionModal.ts` 171, `main.ts` 124, `extractHighlight.ts` 30,
    `types.ts` 6, `collapsible.ts` 5, `helpers.ts` 4, `formatter.ts` 3), in
    six `no-unsafe-*` rules plus `no-redundant-type-constituents` and a single
    `no-unnecessary-type-assertion` at `settings.ts:533`. That fingerprint —
    especially the lone assertion warning — identifies the cause exactly. Not
    one of them is a source defect. `.github/workflows/ci.yml` guards against
    it with a dependency check that fails before the linter ever runs.
- Both halves of the build target **ES2020** (`target` in `tsconfig.json` and in
  `esbuild.config.mjs`). The Electron behind `minAppVersion` 1.13.0 has all of
  it, so nothing is downlevelled.
- TypeScript is **6.0.3**, one major behind `latest`: `typescript-eslint` caps
  at `<6.1.0` and `ts-jest` at `<7`, so 7.x takes the linter and the tests down
  with it. Three tsconfig entries exist only because of the 6.0 defaults —
  `strict: false` (6 flipped the default on; the code predates it),
  `esModuleInterop: true` (mandatory now, and the reason `moment` needs the cast
  in `advancedExtractionModal.ts`) and `rootDir` (6 will not infer an output
  layout from ts-jest's one-file-at-a-time compiles).
- ESLint is **10.x** but `@eslint/js` stays on **9.x** — it is in
  `devDependencies` only to satisfy `eslint-plugin-obsidianmd`'s `^9.30.1` peer,
  and `eslint.config.mjs` never imports it. Same for `@eslint/json`, pinned to
  the exact `0.14.0` that plugin asks for.

## npm audit

`npm audit` reports **0 vulnerabilities**, on Windows and on Linux. It reported
29 for a while; that was stale advisory metadata, now corrected upstream, not a
change in this tree. **The `overrides` block is what keeps it at zero — do not
"simplify" it.**

- The advisory was [GHSA-mh99-v99m-4gvg][be] (CVE-2026-14257), an
  out-of-memory DoS in `brace-expansion` reachable by feeding it a hostile glob.
  Everything else in the old report was a package depending on it through
  `minimatch`. Nothing reached the plugin anyway: `main.js` bundles only
  `handlebars`, `pdfjs-dist` and this repo's source.
- Every copy of `brace-expansion` in the tree carries the
  `EXPANSION_MAX_LENGTH` guard — `2.1.4` under old `minimatch`, `5.0.9` under
  `minimatch@10`. Verify with `npm ls brace-expansion --all` and read the
  versions; the audit count is the weaker signal.
- The selector is `minimatch@<10` **on purpose, and this is load-bearing**.
  `brace-expansion@5` exports `expand` as a *named* export; `minimatch` 3, 8
  and 9 all want the default one. A blanket `"brace-expansion": "^5.0.9"`
  installs cleanly, passes lint, tests and build, reports zero vulnerabilities —
  and then throws `(0 , brace_expansion_1.default) is not a function` the first
  time anything expands a brace glob. It was committed once and reverted.
  `2.1.x` is the maintenance backport that carries the fix and keeps the
  CommonJS default export.
- Zero is **not** reachable by moving every `minimatch` to `>=10`:
  `eslint-plugin-import@2.32.0` (via `eslint-plugin-obsidianmd`) calls
  `minimatch()` as a function, which `minimatch@10` no longer exports.

[be]: https://github.com/advisories/GHSA-mh99-v99m-4gvg

## package-lock.json is generated on Linux

**Never commit a `package-lock.json` that `npm install` wrote on Windows.** The
Windows resolution is 674 entries; the Linux one is 676. The two extra are
top-level `node_modules/@emnapi/core` and `node_modules/@emnapi/runtime`,
optional transitive dependencies of the native `@unrs/resolver` binding that
`eslint-plugin-import` loads. Windows never resolves them at the top level, so a
lockfile written there is complete locally and short everywhere else:

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json ... are in sync.
npm error Missing: @emnapi/core@1.11.3 from lock file
npm error Missing: @emnapi/runtime@1.11.3 from lock file
```

Three things make this worse than it sounds, and all three have been hit:

- **The declared dependencies are in sync.** `dependencies` and
  `devDependencies` match the lockfile exactly; only the resolved tree is
  short. Diffing the two files tells you nothing.
- **npm's own advice is a trap here.** The error says to run `npm install` —
  which, run on Windows, regenerates the *broken* lockfile and reverts the fix
  silently, leaving no diff. It only helps on Linux or macOS.
- **It is invisible on Windows.** `npm ci`, lint, tests and build all pass
  there with the short lockfile.

To regenerate, in WSL (Ubuntu 24.04 with a native Node 24 — not the Windows
`node` that `/mnt/c` interop puts on `PATH`):

```bash
cp package.json package-lock.json ~/lockgen/ && cd ~/lockgen
npm install          # rewrites package-lock.json with the hoisted entries
rm -rf node_modules && npm ci    # must succeed
```

then copy `package-lock.json` back. The result still carries the win32, linux
and darwin binaries (8 / 27 / 6 entries), so it works on every platform —
`npm ci` on Windows is the check for that. `ci.yml` verifies the two hoisted
entries are present before installing, so a Windows-written lockfile fails
there with the fix named rather than as npm's "not in sync".

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
  it decides whether the PDF text underneath is extracted.
- `desiredByDefault` — derives `DEFAULT_DESIRED_ANNOTATIONS`.

The settings tab renders one checkbox per entry, labelled with `description`, so
adding a subtype is a one-line change. `desiredAnnotations` is persisted as a
list of subtype strings.

## Templates

One per annotation type over a `defaultTemplate` that covers the types with
none of their own; a blank entry means "use the default". **Every type starts
blank**, so `DEFAULT_NOTE_TEMPLATE` in the locale is the only template a fresh
install has — it carries a `{{highlightedText}}` that simply renders empty for
the types marking up nothing. Don't reintroduce a second shipped template.

Location is a template variable, not a setting — `{{filelink}}` renders
`[[path]]` inside the vault and the bare `file://` path outside it, and
`{{isExternal}}` is exposed for templates that need more than the link to
differ. `isExternalFile` reaches the formatter from the command: true only for
the clipboard path commands.

## Settings loading

The fork changed the plugin id, so it always starts from a fresh `data.json` and
carries **no migrations** — don't add any for versions of the ancestor plugin.
`loadSettings` copies every declared field, then runs the `normalize*` statics in
`PDFAnnotationPluginSetting` over the ones with a closed set of values. Those
exist for a hand-edited `data.json` and for types added in later versions, not
for upgrades: anything unrecognised falls back to the default.

## Settings tab

Declared through Obsidian 1.13's `getSettingDefinitions()`. `display()` is gone:
a non-empty array of definitions renders the tab **instead of** it, and
`minAppVersion` is 1.13.0, so nothing reaches it.

The array is one group holding one definition per section of the tab —
header, annotation types, templates, grouping, headings, notes — and it never
changes shape. Five rules keep it working; each one is a silent failure if
broken:

- **No `control`.** Nothing in this tab is a control the API describes, so every
  definition uses `render` and draws itself. `render` does **not** auto-save:
  every change handler calls `saveSettings()` itself.
- **Build into `setting.settingEl`, never `group.listEl`.** After each pass
  Obsidian prunes the group's list down to the rows it created itself, so
  anything put there is drawn and deleted in the same tick — a blank tab, no
  console error.
- **Reuse the root.** `update()` runs the callback again on the row it already
  drew; appending a fresh root each time puts the whole UI on screen twice. The
  `section()` helper looks the root up before creating it.
- **Redraw your own root, not the definition list.** Obsidian reconciles rows by
  a key taken from the definition's name, so the list stays static and a section
  that has to change redraws into the root it already owns.
- **Fill in `name`, `desc` and `aliases`.** The settings search indexes the
  definition, not the DOM, and a hit scrolls to the row the section is drawn in.
  Each section names the settings inside it in `aliases`, taken from `t` so
  nothing new needs translating. Adding a setting means adding its name there.

The stylesheet carries the other half of this — see the reset at the top of
`styles.css` and the file-order rule on it.

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
  ru.ts               — every user-facing string; the original
  en.ts               — the same keys, in the same order, translated from ru.ts
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
versions.json         — plugin version → the minAppVersion it shipped with
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
3. Add the new version to `versions.json`, mapped to the `minAppVersion` this
   release ships with — that file is what lets an older Obsidian keep offering
   the last release it can actually run. It is read from the repository, not
   from the release assets, so it only has to be committed. It covers this
   plugin's own releases only: the history before `1.0.0` belongs to the plugin
   this one was forked from, under a different id
4. Push

The workflow then runs `npm ci` and `npm run build`, attests build provenance for
`main.js` / `manifest.json` / `styles.css`, creates the release with those three
assets, and verifies the attestations. It skips if that version is already
released, so unrelated `manifest.json` edits are harmless.

The release workflow itself does not run lint or tests — `.github/workflows/ci.yml`
does, on every push and pull request, with `--max-warnings 0`. Still run
`npm run lint` and `npm test` before pushing; CI is the backstop, not the
first look.

## Style

- `.editorconfig`: tabs, indent 4, UTF-8, final newline.
- `eslint.config.mjs` (flat config) extends `eslint-plugin-obsidianmd`'s
  `recommended`, which bundles `eslint:recommended`, typescript-eslint
  `recommended-type-checked`, `import`, `depend` and `no-unsanitized`.
- Lint is **clean**: 0 errors and 0 warnings. Keep it that way.
- Every component carries a `then()` for chaining, which
  `@typescript-eslint/no-misused-promises` reads as a promise. Never test one
  for truth — compare it with `null`, or the rule fails the build.
- pdf.js data is typed at the boundary, not passed around as `any`:
  `RawPDFAnnotation` (what pdf.js reports), `PDFAnnotation` (once extraction has
  filled in the note's fields), `PositionedText` and `PDFJsLib` in `src/types.ts`.
  `loadPdfJs()` and `getAnnotations()` return `any` — cast once, there.
- Local overrides in `eslint.config.mjs`: `no-unused-vars` on (args: none),
  `ban-ts-comment` off, `no-explicit-any` autofix disabled (its `fixToUnknown`
  fixer rewrites `any` to `unknown` and breaks every call site).
- No inline UI styles — put CSS in `styles.css` and add a class.
- Settings UI: headings via `new Setting(el).setName(...).setHeading()`, sentence
  case for all user-facing text, no plugin name in command names. A new setting
  goes into the section renderer it belongs to and its name goes into that
  section's `aliases` — see **Settings tab**.
- No CSS rule that re-asserts a settings row of this plugin's own may be added
  above the reset at the top of `styles.css`: they tie with it at 0,3,0, so file
  order is the only thing settling them.
- **No string literals in the UI** — command names, notices, setting names and
  descriptions, the settings header, and the default templates and export names
  (they end up in exported notes) all come from `lang/en.ts`, reached as
  `t.SOME_KEY` via `import { t } from "lang/helpers"`. Flat `UPPER_SNAKE` keys
  grouped under `// ─── Section ───` banners; values are plain strings, and
  anything variable is interpolated at the call site
  (`` new Notice(`${t.NOTICE_COPIED}: ${variable}`) ``). A new language is a
  copy of `en.ts` listed in `helpers.ts`'s `localeMap`. Every locale file must
  carry all of `en.ts`'s keys, since `t` is typed as `typeof en`.
- **`ru.ts` is the original; `en.ts` is translated from it.** New or reworded UI
  text goes into `ru.ts` first and `en.ts` is synced to match in the same
  change — never the reverse. Three kinds of value are not free prose in any
  locale: `HANDLEBARS_LINK` must appear verbatim inside that file's
  `SECTION_TEMPLATES_DESC` for the link to be woven in, `DATE_FORMAT` is a
  moment format string (`ru` uses `D MMMM YYYY`, since moment's `LL` adds a
  "г." that suits prose and not a list), and `DEFAULT_*_TEMPLATE`,
  `DEFAULT_NOTE_NAME` and `NAME_NO_TOPIC` may only have the words around their
  `{{variables}}` translated.
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
