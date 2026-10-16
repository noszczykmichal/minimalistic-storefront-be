import { UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { AuthController } from "@/auth/auth.controller.js";
import { REFRESH_TTL_MS, SESSION_COOKIE } from "@/auth/auth.constants.js";

const session = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  user: { firstName: "Jan", email: "jan@example.com" },
  accessTokenExpiresAt: 1_700_000_000_000,
};

const expectedCookieOptions = {
  httpOnly: true,
  secure: false,
  sameSite: "lax",
  path: "/",
};

const createRequest = (cookies?: Record<string, string>) =>
  ({ cookies }) as unknown as Request;

const createResponse = () => {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  res.cookie.mockReturnValue(res);
  res.clearCookie.mockReturnValue(res);
  return res;
};

const createMocks = (Controller: typeof AuthController = AuthController) => {
  const userService = { create: vi.fn().mockResolvedValue({ id: "user-1" }) };
  const authService = {
    login: vi.fn().mockResolvedValue(session),
    refresh: vi.fn().mockResolvedValue(session),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const controller = new Controller(userService as any, authService as any);
  const res = createResponse();

  return { controller, userService, authService, res };
};

describe("AuthController", () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("login", () => {
    const credentials = { email: "jan@example.com", password: "Secret1!" };

    it("passes the credentials to AuthService", async () => {
      await mocks.controller.login(credentials, mocks.res as any);

      expect(mocks.authService.login).toHaveBeenCalledWith(
        "jan@example.com",
        "Secret1!",
      );
    });

    it("sets the refresh token as an httpOnly session cookie", async () => {
      await mocks.controller.login(credentials, mocks.res as any);

      expect(mocks.res.cookie).toHaveBeenCalledWith(
        SESSION_COOKIE,
        "refresh-token",
        { ...expectedCookieOptions, maxAge: REFRESH_TTL_MS },
      );
    });

    it("returns the access token without exposing the refresh token", async () => {
      const result = await mocks.controller.login(
        credentials,
        mocks.res as any,
      );

      expect(result).toEqual({
        accessToken: "access-token",
        user: { firstName: "Jan", email: "jan@example.com" },
        accessTokenExpiresAt: session.accessTokenExpiresAt,
      });
      expect(result).not.toHaveProperty("refreshToken");
    });

    it("does not set a cookie when login fails", async () => {
      mocks.authService.login.mockRejectedValue(new UnauthorizedException());

      await expect(
        mocks.controller.login(credentials, mocks.res as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(mocks.res.cookie).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    it("rotates the session cookie using the token from the request", async () => {
      const req = createRequest({ [SESSION_COOKIE]: "old-token" });

      const result = await mocks.controller.refresh(req, mocks.res as any);

      expect(mocks.authService.refresh).toHaveBeenCalledWith("old-token");
      expect(mocks.res.cookie).toHaveBeenCalledWith(
        SESSION_COOKIE,
        "refresh-token",
        { ...expectedCookieOptions, maxAge: REFRESH_TTL_MS },
      );
      expect(result).toEqual({
        accessToken: "access-token",
        user: { firstName: "Jan", email: "jan@example.com" },
        accessTokenExpiresAt: session.accessTokenExpiresAt,
      });
      expect(result).not.toHaveProperty("refreshToken");
    });

    it.each([
      ["no cookies object", createRequest(undefined)],
      ["no session cookie", createRequest({ other: "value" })],
      ["an empty session cookie", createRequest({ [SESSION_COOKIE]: "" })],
    ])("rejects a request with %s", async (_, req) => {
      await expect(
        mocks.controller.refresh(req, mocks.res as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(mocks.authService.refresh).not.toHaveBeenCalled();
      expect(mocks.res.cookie).not.toHaveBeenCalled();
    });

    it("does not set a cookie when the service rejects the token", async () => {
      mocks.authService.refresh.mockRejectedValue(new UnauthorizedException());
      const req = createRequest({ [SESSION_COOKIE]: "old-token" });

      await expect(
        mocks.controller.refresh(req, mocks.res as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(mocks.res.cookie).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("deletes the session and clears the cookie", async () => {
      const req = createRequest({ [SESSION_COOKIE]: "some-token" });

      const result = await mocks.controller.logout(req, mocks.res as any);

      expect(mocks.authService.logout).toHaveBeenCalledWith("some-token");
      expect(mocks.res.clearCookie).toHaveBeenCalledWith(
        SESSION_COOKIE,
        expectedCookieOptions,
      );
      expect(result).toEqual({ message: "Logout" });
    });

    it("clears the cookie even without a session cookie", async () => {
      const result = await mocks.controller.logout(
        createRequest(undefined),
        mocks.res as any,
      );

      expect(mocks.authService.logout).not.toHaveBeenCalled();
      expect(mocks.res.clearCookie).toHaveBeenCalledWith(
        SESSION_COOKIE,
        expectedCookieOptions,
      );
      expect(result).toEqual({ message: "Logout" });
    });
  });

  describe("createUser", () => {
    const dto = {
      firstName: "Jan",
      lastName: "Kowalski",
      email: "jan@example.com",
      password: "Secret1!",
    };

    it("creates the user without returning any user data", async () => {
      const result = await mocks.controller.createUser(dto);

      expect(mocks.userService.create).toHaveBeenCalledWith(dto);
      expect(result).toBeUndefined();
    });

    it("propagates errors from UserService", async () => {
      const error = new Error("Unable to create account");
      mocks.userService.create.mockRejectedValue(error);

      await expect(mocks.controller.createUser(dto)).rejects.toBe(error);
    });
  });

  describe("cookie options in production", () => {
    it("marks the session cookie as secure", async () => {
      // cookieOptions is evaluated at import time, so reload the module.
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();
      const { AuthController: ProdController } =
        await import("@/auth/auth.controller.js");
      const prod = createMocks(ProdController);

      await prod.controller.login(
        { email: "jan@example.com", password: "Secret1!" },
        prod.res as any,
      );

      expect(prod.res.cookie).toHaveBeenCalledWith(
        SESSION_COOKIE,
        "refresh-token",
        expect.objectContaining({ secure: true }),
      );
    });
  });
});
