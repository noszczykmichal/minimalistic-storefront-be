import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { JwtStrategy } from "./jwt-strategy.js";

const SECRET = "test-secret";
const PAYLOAD = { sub: "user-1", email: "user@example.com" };

type Outcome =
  | { type: "success"; user: unknown }
  | { type: "fail"; info: unknown }
  | { type: "error"; error: unknown };

/**
 * Runs the request through the strategy the way Passport does and resolves
 * with whichever outcome the strategy reports.
 */
const authenticate = (strategy: JwtStrategy, authorization?: string) =>
  new Promise<Outcome>((resolve) => {
    // Passport attaches these to the strategy instance before calling it.
    const s = strategy as unknown as {
      success: (user: unknown) => void;
      fail: (info: unknown) => void;
      error: (error: unknown) => void;
      authenticate: (req: Request) => void;
    };
    s.success = (user) => resolve({ type: "success", user });
    s.fail = (info) => resolve({ type: "fail", info });
    s.error = (error) => resolve({ type: "error", error });

    s.authenticate({
      headers: authorization ? { authorization } : {},
    } as Request);
  });

describe("JwtStrategy", () => {
  const sign = (
    payload: object = PAYLOAD,
    options: { secret?: string; expiresIn?: number } = {},
  ) =>
    new JwtService().sign(payload, {
      secret: options.secret ?? SECRET,
      expiresIn: options.expiresIn ?? 60,
    });

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("constructor", () => {
    it("throws when JWT_SECRET is not set", () => {
      vi.stubEnv("JWT_SECRET", undefined);

      expect(() => new JwtStrategy()).toThrow("JWT_SECRET is not set");
    });

    it("throws when JWT_SECRET is empty", () => {
      vi.stubEnv("JWT_SECRET", "");

      expect(() => new JwtStrategy()).toThrow("JWT_SECRET is not set");
    });
  });

  describe("validate", () => {
    it("maps the token payload to the request user", () => {
      expect(new JwtStrategy().validate(PAYLOAD)).toEqual({
        userId: "user-1",
        email: "user@example.com",
      });
    });
  });

  describe("authenticate", () => {
    let strategy: JwtStrategy;

    beforeEach(() => {
      strategy = new JwtStrategy();
    });

    it("accepts a valid bearer token and sets the user", async () => {
      await expect(authenticate(strategy, `Bearer ${sign()}`)).resolves.toEqual(
        {
          type: "success",
          user: { userId: "user-1", email: "user@example.com" },
        },
      );
    });

    it("does not expose other token claims on the user", async () => {
      const token = sign({ ...PAYLOAD, role: "admin" });

      await expect(authenticate(strategy, `Bearer ${token}`)).resolves.toEqual({
        type: "success",
        user: { userId: "user-1", email: "user@example.com" },
      });
    });

    it("rejects a request without an Authorization header", async () => {
      await expect(authenticate(strategy)).resolves.toMatchObject({
        type: "fail",
      });
    });

    it("rejects a token that is not sent as a bearer token", async () => {
      await expect(
        authenticate(strategy, `Basic ${sign()}`),
      ).resolves.toMatchObject({ type: "fail" });
    });

    it("rejects a token signed with a different secret", async () => {
      const token = sign(PAYLOAD, { secret: "other-secret" });

      await expect(
        authenticate(strategy, `Bearer ${token}`),
      ).resolves.toMatchObject({ type: "fail" });
    });

    it("rejects an expired token", async () => {
      const token = sign(PAYLOAD, { expiresIn: -10 });

      await expect(
        authenticate(strategy, `Bearer ${token}`),
      ).resolves.toMatchObject({ type: "fail" });
    });

    it("rejects a tampered token", async () => {
      const [header, , signature] = sign().split(".");
      const forgedPayload = Buffer.from(
        JSON.stringify({ ...PAYLOAD, sub: "someone-else" }),
      ).toString("base64url");

      await expect(
        authenticate(
          strategy,
          `Bearer ${header}.${forgedPayload}.${signature}`,
        ),
      ).resolves.toMatchObject({ type: "fail" });
    });

    it('rejects an unsigned token (alg "none")', async () => {
      const encode = (part: object) =>
        Buffer.from(JSON.stringify(part)).toString("base64url");
      const token = `${encode({ alg: "none", typ: "JWT" })}.${encode(PAYLOAD)}.`;

      await expect(
        authenticate(strategy, `Bearer ${token}`),
      ).resolves.toMatchObject({ type: "fail" });
    });

    it("rejects a malformed token", async () => {
      await expect(
        authenticate(strategy, "Bearer not-a-jwt"),
      ).resolves.toMatchObject({ type: "fail" });
    });
  });
});
