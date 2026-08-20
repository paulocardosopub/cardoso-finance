import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const compat = new FlatCompat({ baseDirectory: dirname, recommendedConfig: js.configs.recommended });

const config = [...compat.extends("next/core-web-vitals", "next/typescript"), {
  ignores: [".next/**", "out/**", "node_modules/**", "next-env.d.ts"],
}];

export default config;
