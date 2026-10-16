import { createTestApp, resetDb, type TestApp } from "../helpers/app.js";
import {
  getSessionCookie,
  login,
  sessionCookie,
  signupAndLogin,
} from "../helpers/auth.js";

const CLEARED_COOKIE = /^__session=; Path=\/; Expires=Thu, 01 Jan 1970/;

describe("POST /auth/logout (e2e)", () => {
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

  it("deletes the session and clears the cookie", async () => {
    const { refreshToken } = await signupAndLogin(t);

    const res = await t
      .api()
      .post("/auth/logout")
      .set("Cookie", sessionCookie(refreshToken))
      .expect(200);

    expect(res.body).toEqual({ message: "Logout" });
    const { header } = getSessionCookie(res);
    expect(header).toMatch(CLEARED_COOKIE);
    expect(header).toContain("HttpOnly");
    await expect(t.prisma.session.count()).resolves.toBe(0);

    await t
      .api()
      .post("/auth/refresh")
      .set("Cookie", sessionCookie(refreshToken))
      .expect(401);
  });

  it("succeeds and clears the cookie without a session cookie", async () => {
    const res = await t.api().post("/auth/logout").expect(200);

    expect(res.body).toEqual({ message: "Logout" });
    expect(getSessionCookie(res).header).toMatch(CLEARED_COOKIE);
  });

  it("only ends the session it was called with", async () => {
    const laptop = await signupAndLogin(t);
    const phone = await login(t);

    await t
      .api()
      .post("/auth/logout")
      .set("Cookie", sessionCookie(laptop.refreshToken))
      .expect(200);

    await expect(t.prisma.session.count()).resolves.toBe(1);
    await t
      .api()
      .post("/auth/refresh")
      .set("Cookie", sessionCookie(phone.refreshToken))
      .expect(200);
  });
});
