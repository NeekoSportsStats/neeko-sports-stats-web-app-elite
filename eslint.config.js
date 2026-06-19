import unusedImports from "eslint-plugin-unused-imports";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // TypeScript-aware config for all TS/TSX source files
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommended],
    plugins: {
      "unused-imports": unusedImports,
      "react-hooks": reactHooks,
    },
    rules: {
      // Defer unused-var detection to the dedicated plugin (handles imports too)
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // Warn on `any` but do not block CI — existing code uses it broadly
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow empty object types (common in generic patterns)
      "@typescript-eslint/no-empty-object-type": "off",
      // React hooks rules — exhaustive-deps as warn so disable-comments resolve
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // Plain JS files (middleware, scripts) — no TypeScript parser needed
  {
    files: ["**/*.js"],
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
