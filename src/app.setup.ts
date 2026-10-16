import { type INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";

/** Middleware, pipes and CORS shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication) {
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
