import type { Linter } from "eslint";
import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

const obsidianRecommendedConfig = obsidianmd.configs?.recommended;

if (!obsidianRecommendedConfig) {
	throw new Error(
		"eslint-plugin-obsidianmd did not expose a recommended config."
	);
}

const obsidianRecommended = Array.from(
	obsidianRecommendedConfig as Iterable<Linter.Config>
);

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				project: "./tsconfig.eslint.json",
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianRecommended,
	globalIgnores([
		"node_modules",
		"dist",
		"tests",
		"vitest.config.ts",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
