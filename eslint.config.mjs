import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      ".kilo/**",
      "**/.generated/**",
      "**/build.mjs",
      "lib/api-zod/src/generated/**",
      "**/*.config.js",
      "**/*.config.mjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
