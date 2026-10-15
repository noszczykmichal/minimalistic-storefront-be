import { createHash } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";

import { AuthService } from "@/auth/auth.service.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TTL_MS,
} from "@/auth/auth.constants.js";

const NOW = new Date("2026-01-01T12:00:00.000Z").getTime();
const PASSWORD = "Secret1!";
// Low cost factor keeps the suite fast; compare() reads rounds from the hash.
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const dbUser = {
  id: "user-1",
  firstName: "Jan",
  email: "jan@example.com",
  passwordHash: PASSWORD_HASH,
};

const createMocks = () => {
  const tx = {
    session: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    session: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const userService = { findOneWithEmail: vi.fn() };
  const jwtService = { signAsync: vi.fn().mockResolvedValue("access-token") };

  const service = new AuthService(
    userService as any,
    jwtService as any,
    prisma as any,
  );

  return { service, prisma, tx, userService, jwtService };
};

describe("AuthService", () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    // Only fake Date so bcrypt's async internals keep running.
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    mocks = createMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("login", () => {
    it("returns tokens and public user data for valid credentials", async () => {
      mocks.userService.findOneWithEmail.mockResolvedValue(dbUser);

      const result = await mocks.service.login(dbUser.email, PASSWORD);

      expect(result).toEqual({
        accessToken: "access-token",
        refreshToken: expect.any(String),
        user: { firstName: "Jan", email: "jan@example.com" },
        accessTokenExpiresAt: NOW + ACCESS_TOKEN_TTL_SECONDS * 1000,
      });
      expect(result.user).not.toHaveProperty("passwordHash");
      expect(mocks.jwtService.signAsync).toHaveBeenCalledWith({
        sub: "user-1",
        email: "jan@example.com",
      });
    });

    it("stores only the SHA-256 hash of the refresh token", async () => {
      mocks.userService.findOneWithEmail.mockResolvedValue(dbUser);

      const { refreshToken } = await mocks.service.login(
        dbUser.email,
        PASSWORD,
      );

      expect(mocks.prisma.session.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          tokenHash: sha256(refreshToken),
          expiresAt: new Date(NOW + REFRESH_TTL_MS),
        },
      });
      const { data } = mocks.prisma.session.create.mock.calls[0][0];
      expect(data.tokenHash).not.toBe(refreshToken);
    });

    it("generates a different refresh token for each login", async () => {
      mocks.userService.findOneWithEmail.mockResolvedValue(dbUser);

      const first = await mocks.service.login(dbUser.email, PASSWORD);
      const second = await mocks.service.login(dbUser.email, PASSWORD);

      expect(first.refreshToken).not.toBe(second.refreshToken);
    });

    it("normalizes the email before looking up the user", async () => {
      mocks.userService.findOneWithEmail.mockResolvedValue(dbUser);

      await mocks.service.login("  JAN@Example.COM ", PASSWORD);

      expect(mocks.userService.findOneWithEmail).toHaveBeenCalledWith(
        "jan@example.com",
      );
    });

    it("rejects a wrong password without creating a session", async () => {
      mocks.userService.findOneWithEmail.mockResolvedValue(dbUser);

      await expect(
        mocks.service.login(dbUser.email, "Wrong1!"),
      ).rejects.toThrow(new UnauthorizedException("Invalid email or password"));
      expect(mocks.prisma.session.create).not.toHaveBeenCalled();
      expect(mocks.jwtService.signAsync).not.toHaveBeenCalled();
    });

    it("rejects an unknown user after comparing against a dummy hash", async () => {
      mocks.userService.findOneWithEmail.mockResolvedValue(null);
      const compare = vi.spyOn(bcrypt, "compare");

      await expect(
        mocks.service.login("nobody@example.com", PASSWORD),
      ).rejects.toThrow(new UnauthorizedException("Invalid email or password"));
      expect(compare).toHaveBeenCalledWith(PASSWORD, expect.any(String));
      expect(mocks.prisma.session.create).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    const storedSession = (expiresAt: Date) => ({
      id: "session-1",
      userId: "user-1",
      tokenHash: sha256("old-token"),
      expiresAt,
      user: { id: "user-1", firstName: "Jan", email: "jan@example.com" },
    });

    it("looks up the session by the hashed token", async () => {
      mocks.prisma.session.findUnique.mockResolvedValue(
        storedSession(new Date(NOW + 1000)),
      );

      await mocks.service.refresh("old-token");

      expect(mocks.prisma.session.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: sha256("old-token") } }),
      );
    });

    it("rotates the session inside a transaction", async () => {
      mocks.prisma.session.findUnique.mockResolvedValue(
        storedSession(new Date(NOW + 1000)),
      );

      const result = await mocks.service.refresh("old-token");

      expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
      expect(mocks.tx.session.deleteMany).toHaveBeenCalledWith({
        where: { id: "session-1" },
      });
      expect(mocks.tx.session.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          tokenHash: sha256(result.refreshToken),
          expiresAt: new Date(NOW + REFRESH_TTL_MS),
        },
      });
      expect(mocks.prisma.session.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: "access-token",
        refreshToken: expect.any(String),
        user: { firstName: "Jan", email: "jan@example.com" },
        accessTokenExpiresAt: NOW + ACCESS_TOKEN_TTL_SECONDS * 1000,
      });
      expect(result.refreshToken).not.toBe("old-token");
      expect(mocks.jwtService.signAsync).toHaveBeenCalledWith({
        sub: "user-1",
        email: "jan@example.com",
      });
    });

    it("rejects an unknown token", async () => {
      mocks.prisma.session.findUnique.mockResolvedValue(null);

      await expect(mocks.service.refresh("unknown")).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    });

    it("deletes an expired session and rejects", async () => {
      mocks.prisma.session.findUnique.mockResolvedValue(
        storedSession(new Date(NOW - 1000)),
      );

      await expect(mocks.service.refresh("old-token")).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { id: "session-1" },
      });
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    });

    it("still rejects with 401 when a concurrent request already deleted the expired session", async () => {
      mocks.prisma.session.findUnique.mockResolvedValue(
        storedSession(new Date(NOW - 1000)),
      );
      mocks.prisma.session.deleteMany.mockResolvedValue({ count: 0 });

      await expect(mocks.service.refresh("old-token")).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mocks.prisma.session.delete).not.toHaveBeenCalled();
    });

    it("rejects when the session was rotated by a concurrent request", async () => {
      mocks.prisma.session.findUnique.mockResolvedValue(
        storedSession(new Date(NOW + 1000)),
      );
      mocks.tx.session.deleteMany.mockResolvedValue({ count: 0 });

      await expect(mocks.service.refresh("old-token")).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mocks.tx.session.create).not.toHaveBeenCalled();
      expect(mocks.jwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("deletes the session matching the hashed token", async () => {
      await mocks.service.logout("some-token");

      expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256("some-token") },
      });
    });

    it("does not throw for an unknown token", async () => {
      mocks.prisma.session.deleteMany.mockResolvedValue({ count: 0 });

      await expect(mocks.service.logout("unknown")).resolves.toBeUndefined();
    });
  });
});
