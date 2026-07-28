# Contributing

## Build

Clone the repository and install the dependencies:

```bash
git clone https://github.com/pan4ratte/obsidian-classy-pdf-extractor.git
cd obsidian-classy-pdf-extractor
npm install
```

Build once, which type-checks with `tsc` and then bundles with esbuild:

```bash
npm run build
```

Or watch for changes while you work, which skips the type-check:

```bash
npm run dev
```

The plugin is three files: `main.js`, `manifest.json` and `styles.css`. `main.js` is gitignored — it is built, not committed.

## Running it in a vault

Copy the three files into a folder of their own under your vault's plugins directory, then enable the plugin in Obsidian's settings:

```bash
mkdir -p ~/MyVault/.obsidian/plugins/classy-pdf-extractor
cp main.js manifest.json styles.css ~/MyVault/.obsidian/plugins/classy-pdf-extractor/
```

For day-to-day work it is easier to clone the repository straight into that plugins directory and install the [Hot Reload](https://github.com/pjeby/hot-reload) plugin, which reloads it whenever `main.js` is rebuilt.

## Tests and lint

```bash
npm test
npm run lint
```

Both are expected to pass before a pull request. They are not gated by the release workflow, so run them yourself.

## Interface text

All user-facing strings live in `lang/`. **`ru.ts` is the original and `en.ts` is translated from it** — change the Russian first, then sync the English in the same commit. Both files must carry the same keys in the same order, since `t` is typed as `typeof en`.

To add a language, copy `en.ts`, translate the values, and list it in `helpers.ts` under the locale code Obsidian reports.

## Releases

`manifest.json` is the source of truth. The release workflow runs when its `version` changes on the release branch — there is no manual tagging. In one commit:

1. Bump `version` in **both** `manifest.json` and `package.json` to the same value; the workflow fails if they disagree.
2. Rename `## Unreleased` in `CHANGELOG.md` to that version — the workflow takes the release notes from the matching `## <version>` section.
3. Push.
