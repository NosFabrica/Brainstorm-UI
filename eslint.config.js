// One rule, as an error: hooks run in the same order on every render. Two
// components broke it (a hook below an early return) and each took a page
// down in production. The plugins are loaded so the source's existing
// eslint-disable comments name rules ESLint knows; nothing else is enforced.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", "artifacts/**"] },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
