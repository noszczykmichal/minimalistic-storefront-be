import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule, minutes } from "@nestjs/throttler";
import { AuthModule } from "@/auth/auth.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { UserModule } from "@/user/user.module.js";
import { CheckoutModule } from "@/checkout/checkout.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { CatalogModule } from './catalog/catalog.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Default per-IP limit for every route; auth routes tighten it with @Throttle.
    ThrottlerModule.forRoot([{ ttl: minutes(1), limit: 100 }]),
    AuthModule,
    PrismaModule,
    UserModule,
    CheckoutModule,
    OrdersModule,
    CatalogModule,
  ],
  controllers: [],
  providers: [
    ThrottlerGuard,
    // useExisting lets e2e tests swap the guard out via overrideProvider.
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
  ],
})
export class AppModule {}
