import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";

import { AppModule } from "@/app.module.js";
import { configureApp } from "@/app.setup.js";
import { PrismaService } from "@/prisma/prisma.service.js";

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** Boots the full app the same way main.ts does, on a random port. */
export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication({
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
