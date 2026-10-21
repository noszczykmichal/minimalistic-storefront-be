import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { SESSION_COOKIE } from "./auth/auth.constants.js";
import { configureApp } from "./app.setup.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const config = new DocumentBuilder()
    .setTitle("Minimalistic Storefront API")
    .setDescription("Auth and users for the storefront")
    .setVersion("1.0")
    .addBearerAuth()
    .addCookieAuth(SESSION_COOKIE)
    .build();

  configureApp(app);

  if (process.env.NODE_ENV !== "production") {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("docs", app, document);
  }

  await app.listen(process.env.PORT ?? 8000);
}
await bootstrap();
