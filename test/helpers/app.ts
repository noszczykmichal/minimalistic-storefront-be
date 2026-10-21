import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { JwtService } from "@nestjs/jwt";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";

import { AppModule } from "@/app.module.js";
import { configureApp } from "@/app.setup.js";
import { PrismaService } from "@/prisma/prisma.service.js";

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/**
 * Boots the full app the same way main.ts does, on a random port.
 * Rate limiting is off unless `throttle` is set, since most specs log in
 * far more often than the limits allow.
 */
export async function createTestApp({ throttle = false } = {}) {
  const builder = Test.createTestingModule({
    imports: [AppModule],
  });
  if (!throttle) {
    builder
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true });
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  // Listening up front lets supertest send concurrent requests to one server.
  await app.listen(0);

  return {
    app,
    prisma: app.get(PrismaService),
    jwt: app.get(JwtService),
    api: () => request(app.getHttpServer()),
  };
}

export async function resetDb(prisma: PrismaService) {
  await prisma.$executeRawUnsafe('TRUNCATE "User", "Session" CASCADE');
}
