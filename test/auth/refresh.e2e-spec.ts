import { createTestApp, resetDb, type TestApp } from "../helpers/app.js";
import {
  getSessionCookie,
  sessionCookie,
  sha256,
  signupAndLogin,
} from "../helpers/auth.js";

describe("POST /auth/refresh (e2e)", () => {
  let t: TestApp;

  const refresh = (token?: string) => {
    const req = t.api().post("/api/auth/refresh");
    return token === undefined ? req : req.set("Cookie", sessionCookie(token));
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it("rotates the session and returns a new access token", async () => {
    const { refreshToken } = await signupAndLogin(t);

    const res = await refresh(refreshToken).expect(200);

    const newToken = getSessionCookie(res).value;
    expect(newToken).not.toBe(refreshToken);
    expect(res.body).toEqual({
      accessToken: expect.any(String),
      user: { firstName: "Jan", email: "jan@example.com" },
      accessTokenExpiresAt: expect.any(Number),
    });
    await expect(
      t.jwt.verifyAsync(res.body.accessToken),
    ).resolves.toMatchObject({ email: "jan@example.com" });

    const sessions = await t.prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toBe(sha256(newToken));
  });

  it("rejects the old token after rotation", async () => {
    const { refreshToken } = await signupAndLogin(t);
    await refresh(refreshToken).expect(200);

    await refresh(refreshToken).expect(401);
  });

  it("rejects a request without a session cookie", async () => {
    await refresh().expect(401);
  });

  it("rejects an unknown token", async () => {
    await signupAndLogin(t);

    await refresh("not-a-real-token").expect(401);
    await expect(t.prisma.session.count()).resolves.toBe(1);
  });

  it("rejects an expired session and deletes it", async () => {
    const { refreshToken } = await signupAndLogin(t);
    await t.prisma.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await refresh(refreshToken).expect(401);

    expect(res.headers["set-cookie"]).toBeUndefined();
    await expect(t.prisma.session.count()).resolves.toBe(0);
  });

  it("lets only one of two concurrent refreshes with the same token succeed", async () => {
    const { refreshToken } = await signupAndLogin(t);

    // Without this, the second request only reaches the DB after the first one
    // has finished. Hold both after the session lookup and release them
    // together, so both rotations race on the same row inside Postgres.
    const findUnique = t.prisma.session.findUnique.bind(t.prisma.session);
    let arrived = 0;
    let release!: () => void;
    const bothArrived = new Promise<void>((resolve) => (release = resolve));
    const spy = vi
      .spyOn(t.prisma.session, "findUnique")
      .mockImplementation((async (args: Parameters<typeof findUnique>[0]) => {
        const session = await findUnique(args);
        if (++arrived === 2) release();
        await bothArrived;
        return session;
      }) as any);
    onTestFinished(() => spy.mockRestore());

    const responses = await Promise.all([
      refresh(refreshToken),
      refresh(refreshToken),
    ]);

    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 401,
    ]);
    const winner = responses.find((r) => r.status === 200)!;
    const sessions = await t.prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toBe(sha256(getSessionCookie(winner).value));
  });

  it("rejects the token once the user has been deleted", async () => {
    const { refreshToken } = await signupAndLogin(t);

    await t.prisma.user.deleteMany();

    await expect(t.prisma.session.count()).resolves.toBe(0);
    await refresh(refreshToken).expect(401);
  });
});
