import { createHash } from "node:crypto";
import type { Response } from "supertest";

import { SESSION_COOKIE } from "@/auth/auth.constants.js";
import type { TestApp } from "./app.js";

export const validUser = {
  firstName: "Jan",
  lastName: "Kowalski",
  email: "jan@example.com",
  password: "Secret1!",
};

export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Returns the raw Set-Cookie header and value of the session cookie. */
export function getSessionCookie(res: Response) {
  const headers = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  const header = headers.find((h) => h.startsWith(`${SESSION_COOKIE}=`));
  if (!header) {
    throw new Error(`Response has no ${SESSION_COOKIE} cookie`);
  }
  const value = decodeURIComponent(
    header.slice(SESSION_COOKIE.length + 1).split(";")[0],
  );
  return { header, value };
}

/** Value for supertest's `.set("Cookie", ...)`. */
export const sessionCookie = (value: string) => `${SESSION_COOKIE}=${value}`;

export interface LoginResult {
  res: Response;
  accessToken: string;
  refreshToken: string;
}

export async function signup(
  t: TestApp,
  overrides: Partial<typeof validUser> = {},
): Promise<Response> {
  return t
    .api()
    .post("/api/auth/signup")
    .send({ ...validUser, ...overrides })
    .expect(201);
}

export async function login(
  t: TestApp,
  credentials = { email: validUser.email, password: validUser.password },
): Promise<LoginResult> {
  const res = await t.api().post("/api/auth/login").send(credentials).expect(200);
  return {
    res,
    accessToken: res.body.accessToken as string,
    refreshToken: getSessionCookie(res).value,
  };
}

export async function signupAndLogin(t: TestApp): Promise<LoginResult> {
  await signup(t);
  return login(t);
}
