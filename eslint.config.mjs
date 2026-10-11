import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.flat.recommended.rules,
  },
  {
    ignores: ["**/.next/**", "**/node_modules/**", "**/out/**", "**/build/**", "**/coverage/**", "next-env.d.ts"],
  },
);
