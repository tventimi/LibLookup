import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import css from "@eslint/css";
import { defineConfig } from "eslint/config";
import { jest } from 'eslint-plugin-jest'

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs}"], ignores: ["forge.config.cjs"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: {...globals.browser, ...globals.node} } },
  { files: ["**/*.json"], ignores: ["package-lock.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
  { files: ["**/*.css"], plugins: { css }, language: "css/css", extends: ["css/recommended"] },
  {
    files: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
    plugins: {
      jest,
    },
    languageOptions: {
      globals: {
        ...jest.environments.globals.globals, // Grants global access to describe, test, expect, etc.
      },
    },
    rules: {
      ...jest.configs.recommended.rules, // Enables standard Jest rules
      'jest/no-disabled-tests': 'warn',   // Warns if you leave a test skipped
      'jest/no-focused-tests': 'error',   // Errors out if .only is left on a test
      'jest/prefer-to-have-length': 'warn',
    },
  },
]);
