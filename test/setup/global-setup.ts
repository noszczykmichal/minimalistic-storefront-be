import { execSync } from "node:child_process";
import pg from "pg";

import { loadTestEnv } from "./test-env.js";

/** Runs once before all e2e files: creates the test database and migrates it. */
export default async function globalSetup() {
  const { url, databaseName } = loadTestEnv();

  if (!/^[a-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Unexpected test database name: "${databaseName}"`);
  }

  // CREATE DATABASE has to run while connected to a different database.
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await client.end();
  }

  execSync("pnpm prisma migrate deploy --config prisma7.config.ts", {
    env: process.env,
    stdio: "inherit",
  });
}
