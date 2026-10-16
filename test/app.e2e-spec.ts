import { createTestApp, resetDb, type TestApp } from "./helpers/app.js";
import {
  getSessionCookie,
  login,
  sessionCookie,
  signup,
} from "./helpers/auth.js";

const FRONTEND_ORIGIN = "http://localhost:3000";

describe("App (e2e)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it("supports the full session lifecycle", async () => {
    await signup(t);
    const { refreshToken } = await login(t);

    const first = await t
      .api()
      .post("/auth/refresh")
      .set("Cookie", sessionCookie(refreshToken))
      .expect(200);
    const second = await t
      .api()
      .post("/auth/refresh")
      .set("Cookie", sessionCookie(getSessionCookie(first).value))
      .expect(200);
    const latest = getSessionCookie(second).value;

    await t
      .api()
      .post("/auth/logout")
      .set("Cookie", sessionCookie(latest))
      .expect(200);

    await t
      .api()
      .post("/auth/refresh")
      .set("Cookie", sessionCookie(latest))
      .expect(401);
    await expect(t.prisma.session.count()).resolves.toBe(0);
  });

  describe("CORS", () => {
    const preflight = (origin: string) =>
      t
        .api()
        .options("/auth/login")
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "POST");

    it("allows the frontend origin with credentials", async () => {
      const res = await preflight(FRONTEND_ORIGIN).expect(204);

      expect(res.headers["access-control-allow-origin"]).toBe(FRONTEND_ORIGIN);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("does not allow other origins", async () => {
      const res = await preflight("http://evil.example");

      // A fixed-string origin is always echoed; the browser blocks the mismatch.
      expect(res.headers["access-control-allow-origin"]).not.toBe(
        "http://evil.example",
      );
    });
  });

  it("returns 404 for an unknown route", async () => {
    await t.api().get("/").expect(404);
  });
});
