import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AppModule } from "@/app.module.js";
import { configureApp } from "@/app.setup.js";
import { PrismaService } from "@/prisma/prisma.service.js";

describe("POST /auth/login (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Session" CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  it("logs in a user created through signup", async () => {
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send({
        firstName: "Jan",
        lastName: "Kowalski",
        email: "jan@example.com",
        password: "Secret1!",
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "jan@example.com", password: "Secret1!" })
      .expect(200);

    expect(res.body).toEqual({
      accessToken: expect.any(String),
      user: { firstName: "Jan", email: "jan@example.com" },
      accessTokenExpiresAt: expect.any(Number),
    });
    expect(res.headers["set-cookie"]).toEqual([
      expect.stringMatching(/^__session=/),
    ]);
  });
});
