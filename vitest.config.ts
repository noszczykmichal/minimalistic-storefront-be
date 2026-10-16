import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: "./",
    include: ["**/*.spec.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      exclude: [
        "src/generated/**",
        "src/main.ts",
        "**/*.module.ts",
        "src/auth/auth.constants.ts",
      ],
    },
  },
});
