import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

import { AuthController } from "@/auth/auth.controller.js";
import { AuthService } from "@/auth/auth.service.js";
import { UserModule } from "@/user/user.module.js";
import { ACCESS_TOKEN_TTL_SECONDS } from "./auth.constants.js";
import { PassportModule } from "@nestjs/passport";
import { JwtStrategy } from "./strategies/jwt-strategy.js";

@Module({
  imports: [
    PassportModule,
    UserModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
