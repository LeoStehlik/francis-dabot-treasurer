import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", ".reference/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["*.config.*", "src/**/*.test.ts", "src/test-fixtures.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["src/discord-gateway.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-base-to-string": "off",
    },
  },
  {
    files: ["src/index.ts"],
    rules: { "@typescript-eslint/no-unsafe-argument": "off" },
  },
  {
    rules: { "@typescript-eslint/require-await": "off" },
  },
);
