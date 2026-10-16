import { createTestApp, resetDb, type TestApp } from "../helpers/app.js";
import { signup, validUser } from "../helpers/auth.js";

describe("POST /auth/signup (e2e)", () => {
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

  it("creates the user and returns 201 with an empty body", async () => {
    const res = await signup(t, { email: "  JAN@Example.COM " });

    expect(res.text).toBe("");
    const user = await t.prisma.user.findUniqueOrThrow({
      where: { email: "jan@example.com" },
      omit: { passwordHash: false },
    });
    expect(user).toMatchObject({
      firstName: "Jan",
      lastName: "Kowalski",
      email: "jan@example.com",
    });
    expect(user.passwordHash).not.toBe(validUser.password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$10\$/);
  });

  it("does not set a session cookie", async () => {
    const res = await signup(t);

    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it.each([
    ["the same email", "jan@example.com"],
    ["the same email in different case and with spaces", " JAN@example.com "],
  ])("rejects %s with a generic 400", async (_, email) => {
    await signup(t);

    const res = await t
      .api()
      .post("/auth/signup")
      .send({ ...validUser, email })
      .expect(400);

    expect(res.body.message).toBe("Unable to create account");
    await expect(t.prisma.user.count()).resolves.toBe(1);
  });

  it.each([
    ["a missing field", { firstName: undefined }],
    ["a weak password", { password: "secret" }],
    ["an invalid email", { email: "not-an-email" }],
    ["an unknown field", { role: "admin" }],
  ])("rejects a payload with %s", async (_, overrides) => {
    const res = await t
      .api()
      .post("/auth/signup")
      .send({ ...validUser, ...overrides })
      .expect(400);

    expect(res.body.message).toEqual(expect.any(Array));
    await expect(t.prisma.user.count()).resolves.toBe(0);
  });
});
