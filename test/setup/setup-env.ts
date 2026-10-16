import { loadTestEnv } from "./test-env.js";

// Runs in every test worker before the app is imported, so PrismaService and
// ConfigModule pick up the test database and secret instead of .env.
loadTestEnv();
