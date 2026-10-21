import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { cloudRunTrustProxy } from "@/trust-proxy.js";

/** Middleware, pipes and CORS shared by main.ts and the e2e tests. */
export function configureApp(app: NestExpressApplication) {
  // On Cloud Run req.ip would be the proxy's address and the rate limiter
  // would lump all clients together; read the client IP from X-Forwarded-For
  // without trusting entries a client could have made up.
  if (process.env.TRUST_PROXY === "cloud-run") {
    app.set("trust proxy", cloudRunTrustProxy);
  }

  app.use(cookieParser());

  app.enableCors({
    origin: "http://localhost:3000",
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix("api");
}
