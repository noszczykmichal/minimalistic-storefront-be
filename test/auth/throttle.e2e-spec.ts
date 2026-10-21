import { LOGIN_THROTTLE, SIGNUP_THROTTLE } from "@/auth/auth.constants.js";
import { createTestApp, resetDb, type TestApp } from "../helpers/app.js";
import { signup, validUser } from "../helpers/auth.js";

describe("Auth rate limiting (e2e)", () => {
  let t: TestApp;

  // A fresh app per test resets the in-memory throttler storage.
  beforeEach(async () => {
    t = await createTestApp({ throttle: true });
    await resetDb(t.prisma);
  });

  afterEach(async () => {
    await t.app.close();
  });

  it("blocks login after too many attempts, even with wrong passwords", async () => {
    const attempt = () =>
      t
        .api()
        .post("/api/auth/login")
        .send({ email: validUser.email, password: "Wrong1!pass" });

    for (let i = 0; i < LOGIN_THROTTLE.limit; i++) {
      await attempt().expect(401);
    }

    const res = await attempt().expect(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("blocks sign-up after too many attempts", async () => {
    for (let i = 0; i < SIGNUP_THROTTLE.limit; i++) {
      await signup(t, { email: `user${i}@example.com` });
    }

    await t
      .api()
      .post("/api/auth/signup")
      .send({ ...validUser, email: "one-more@example.com" })
      .expect(429);
    expect(await t.prisma.user.count()).toBe(SIGNUP_THROTTLE.limit);
  });

  it("counts each route separately", async () => {
    for (let i = 0; i < SIGNUP_THROTTLE.limit; i++) {
      await signup(t, { email: `user${i}@example.com` });
    }

    await t
      .api()
      .post("/api/auth/login")
      .send({ email: "user0@example.com", password: validUser.password })
      .expect(200);
  });
});

// Locally the socket address plays Cloud Run's front end (hop 0), so each
// X-Forwarded-For below is what the app would receive on Cloud Run.
describe("Auth rate limiting behind Cloud Run (e2e)", () => {
  let t: TestApp;

  const realIp = "89.66.224.41";
  const firebaseIp = "66.249.93.132";

  const loginFrom = (forwardedFor: string) =>
    t
      .api()
      .post("/api/auth/login")
      .set("X-Forwarded-For", forwardedFor)
      .send({ email: validUser.email, password: "Wrong1!pass" });

  beforeEach(async () => {
    process.env.TRUST_PROXY = "cloud-run";
    t = await createTestApp({ throttle: true });
    await resetDb(t.prisma);
  });

  afterEach(async () => {
    delete process.env.TRUST_PROXY;
    await t.app.close();
  });

  it("ignores spoofed IPs on direct requests", async () => {
    for (let i = 0; i < LOGIN_THROTTLE.limit; i++) {
      await loginFrom(`10.0.0.${i}, ${realIp}`).expect(401);
    }

    await loginFrom(`10.0.0.99, ${realIp}`).expect(429);
  });

  it("ignores spoofed IPs on requests through Firebase Hosting", async () => {
    for (let i = 0; i < LOGIN_THROTTLE.limit; i++) {
      await loginFrom(`10.0.0.${i}, ${realIp}, ${firebaseIp}`).expect(401);
    }

    await loginFrom(`10.0.0.99, ${realIp}, ${firebaseIp}`).expect(429);
  });

  it("limits users behind Firebase Hosting separately", async () => {
    for (let i = 0; i < LOGIN_THROTTLE.limit; i++) {
      await loginFrom(`${realIp}, ${firebaseIp}`).expect(401);
    }
    await loginFrom(`${realIp}, ${firebaseIp}`).expect(429);

    await loginFrom("203.0.113.7, 66.249.93.99").expect(401);
  });

  it("does not trust a Firebase-looking address supplied by the client", async () => {
    for (let i = 0; i < LOGIN_THROTTLE.limit; i++) {
      await loginFrom(`10.0.0.${i}, ${firebaseIp}, ${realIp}`).expect(401);
    }

    await loginFrom(`10.0.0.99, ${firebaseIp}, ${realIp}`).expect(429);
  });
});
