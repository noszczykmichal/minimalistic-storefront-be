import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const ENV_FILE = fileURLToPath(new URL("../../.env.test", import.meta.url));

/**
 * Loads .env.test over any existing env vars and refuses to continue unless
 * DATABASE_URL points at a test database, since the e2e tests wipe tables.
 */
export function loadTestEnv() {
  config({ path: ENV_FILE, override: true, quiet: true });

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set in .env.test");
  }

  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.includes("test")) {
    throw new Error(
      `Refusing to run e2e tests against "${databaseName}": the database name must contain "test".`,
    );
  }

  return { url, databaseName };
}
