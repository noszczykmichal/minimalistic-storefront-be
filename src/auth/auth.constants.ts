import { hours, minutes } from "@nestjs/throttler";

export const BCRYPT_ROUNDS = 10;

export const ACCESS_TOKEN_TTL_SECONDS = 5 * 60;

export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; //7 days

export const SESSION_COOKIE = "__session";

// Per-IP rate limits for the auth routes (ttl in ms).
export const LOGIN_THROTTLE = { limit: 10, ttl: minutes(1) };

export const SIGNUP_THROTTLE = { limit: 5, ttl: hours(1) };
