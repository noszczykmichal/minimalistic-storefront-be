import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: "./",
    include: ["test/**/*.e2e-spec.ts"],
    globalSetup: ["test/setup/global-setup.ts"],
    setupFiles: ["test/setup/setup-env.ts"],
    // All files share one database, so they must not run at the same time.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
