import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".next-e2e/**",
      "node_modules/**",
      "coverage/**",
      "tmp/**",
      "prisma/dev.db",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
];

export default eslintConfig;
