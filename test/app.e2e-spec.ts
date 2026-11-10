import { createTestApp, resetDb, type TestApp } from "./helpers/app.js";
import {
  getSessionCookie,
  login,
  sessionCookie,
  signup,
} from "./helpers/auth.js";

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
      .post("/api/auth/refresh")
      .set("Cookie", sessionCookie(refreshToken))
      .expect(200);
    const second = await t
      .api()
      .post("/api/auth/refresh")
      .set("Cookie", sessionCookie(getSessionCookie(first).value))
      .expect(200);
    const latest = getSessionCookie(second).value;

    await t
      .api()
      .post("/api/auth/logout")
      .set("Cookie", sessionCookie(latest))
      .expect(200);

    await t
      .api()
      .post("/api/auth/refresh")
      .set("Cookie", sessionCookie(latest))
      .expect(401);
    await expect(t.prisma.session.count()).resolves.toBe(0);
  });

  it("returns 404 for an unknown route", async () => {
    await t.api().get("/").expect(404);
  });
});
