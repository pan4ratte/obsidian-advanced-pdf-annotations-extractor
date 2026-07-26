import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
	globalIgnores(["main.js", "build/**", "coverage/**", "node_modules/**"]),

	// Official Obsidian plugin guidelines ruleset. Bundles eslint:recommended,
	// typescript-eslint recommended-type-checked, import, depend, no-unsanitized
	// and manifest/license validation.
	obsidianmd.configs.recommended,

	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				...globals.node,
				...globals.browser,
			},
		},
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",

			// Node builtins have to be pulled in with a guarded require() inside
			// the CJS bundle; see the Platform.isDesktop guard in main.ts.
			"@typescript-eslint/no-require-imports": ["error", { allow: ["^fs$"] }],

			// The recommended set turns on `fixToUnknown`, whose autofix rewrites
			// `any` to `unknown` and breaks every call site that dereferences it.
			// Keep the report, drop the fixer.
			"@typescript-eslint/no-explicit-any": ["warn", { fixToUnknown: false }],

			// The pdfjs annotation objects are untyped, so the type-checked
			// "unsafe any" family fires across the whole extraction pipeline.
			// Warn while the annotation types get modelled incrementally; these
			// are the remaining debt, not accepted style.
			"@typescript-eslint/no-unsafe-argument": "warn",
			"@typescript-eslint/no-unsafe-assignment": "warn",
			"@typescript-eslint/no-unsafe-call": "warn",
			"@typescript-eslint/no-unsafe-member-access": "warn",
			"@typescript-eslint/no-unsafe-return": "warn",

			// The rule lowercases "PDFs"/"PDF's" because only the bare "PDF"
			// acronym is recognised, and it capitalises "cursor" because Cursor
			// is in its brand list. Passing `acronyms` would replace the default
			// list, so these go through `ignoreWords` instead.
			"obsidianmd/ui/sentence-case": [
				"warn",
				{ ignoreWords: ["PDFs", "PDF's", "cursor"] },
			],
		},
	},

	{
		files: ["test/**/*.ts"],
		languageOptions: {
			globals: globals.jest,
		},
	},

	// Build tooling runs in Node, outside the plugin sandbox.
	{
		files: ["*.mjs", "*.js"],
		languageOptions: {
			globals: globals.node,
		},
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
		},
	},
]);
