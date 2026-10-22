import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Layer boundaries: see docs/adr/0001-layered-architecture.md
const noDynamicImport = {
  selector: "ImportExpression",
  message:
    "Dynamic import() is not allowed in this layer (it would bypass the import rules).",
};

const frameworkAndDrivers = [
  "next",
  "next/*",
  "react",
  "react/*",
  "react-dom",
  "react-dom/*",
  "pg",
  "pg/*",
  "@google/*",
];

const layerRules = [
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", noDynamicImport],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.{1,2}/|@/domain/|node:)",
              message:
                "domain must stay pure: no external packages (only node: builtins and relative imports).",
            },
            {
              group: ["**/application/**", "**/infrastructure/**", "**/app/**"],
              message: "domain cannot import from other layers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", noDynamicImport],
      "no-restricted-imports": [
        "error",
        {
          paths: frameworkAndDrivers.map((name) => ({
            name,
            message:
              "application must not depend on frameworks or drivers; define a port instead.",
          })),
          patterns: [
            {
              group: ["**/infrastructure/**", "**/app/**"],
              message: "application can only depend on domain.",
            },
            {
              group: frameworkAndDrivers,
              message: "application must not depend on frameworks or drivers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/infrastructure/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/app/**"],
              message: "infrastructure cannot import from app.",
            },
            {
              group: [
                "next",
                "next/*",
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
              ],
              message: "infrastructure must not depend on Next/React.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["pg", "pg/*", "@google/*"],
              message:
                "app must go through infrastructure/application, not drivers directly.",
            },
          ],
        },
      ],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  ...layerRules,
]);

export default eslintConfig;
