import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TTL_MS,
} from "@/auth/auth.constants.js";
import { createTestApp, resetDb, type TestApp } from "../helpers/app.js";
import {
  getSessionCookie,
  login,
  sha256,
  signup,
  validUser,
} from "../helpers/auth.js";

describe("POST /auth/login (e2e)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    await signup(t);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it("returns the access token and public user data", async () => {
    const before = Date.now();

    const { res } = await login(t);

    expect(res.body).toEqual({
      accessToken: expect.any(String),
      user: { firstName: "Jan", email: "jan@example.com" },
      accessTokenExpiresAt: expect.any(Number),
    });
    expect(res.body.accessTokenExpiresAt).toBeGreaterThanOrEqual(
      before + ACCESS_TOKEN_TTL_SECONDS * 1000,
    );
    expect(res.text).not.toContain("passwordHash");
  });

  it("sets the refresh token in an httpOnly session cookie", async () => {
    const { res } = await login(t);

    const { header } = getSessionCookie(res);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toContain(`Max-Age=${REFRESH_TTL_MS / 1000}`);
    expect(header).not.toContain("Secure");
  });

  it("issues a JWT for the user that expires with the access token TTL", async () => {
    const { accessToken } = await login(t);

    const payload = await t.jwt.verifyAsync(accessToken);
    const user = await t.prisma.user.findUniqueOrThrow({
      where: { email: "jan@example.com" },
    });
    expect(payload).toMatchObject({ sub: user.id, email: "jan@example.com" });
    expect(payload.exp - payload.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it("stores only the SHA-256 hash of the refresh token", async () => {
    const { refreshToken } = await login(t);

    const sessions = await t.prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toBe(sha256(refreshToken));
    expect(sessions[0].tokenHash).not.toBe(refreshToken);
  });

  it("accepts the email in a different case and with spaces", async () => {
    await login(t, {
      email: "  JAN@Example.COM ",
      password: validUser.password,
    });
  });

  it("creates a separate session for each login", async () => {
    const first = await login(t);
    const second = await login(t);

    expect(first.refreshToken).not.toBe(second.refreshToken);
    await expect(t.prisma.session.count()).resolves.toBe(2);
  });

  it("returns the same 401 for a wrong password and an unknown email", async () => {
    const wrongPassword = await t
      .api()
      .post("/auth/login")
      .send({ email: validUser.email, password: "Wrong1!" })
      .expect(401);
    const unknownEmail = await t
      .api()
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: validUser.password })
      .expect(401);

    expect(wrongPassword.body).toEqual({
      message: "Invalid email or password",
      error: "Unauthorized",
      statusCode: 401,
    });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(wrongPassword.headers["set-cookie"]).toBeUndefined();
    await expect(t.prisma.session.count()).resolves.toBe(0);
  });

  it("rejects an unknown field", async () => {
    await t
      .api()
      .post("/auth/login")
      .send({ email: validUser.email, password: validUser.password, x: 1 })
      .expect(400);
  });
});
