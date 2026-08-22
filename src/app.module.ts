import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module'; // <- si tu prisma.module.ts estÃ¡ en raÃ­z, ajusta este import
import { UsersModule } from './modules/users/user.module';

import { OfferModule } from './modules/offer/offer.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { OrderModule } from './modules/order/order.module';
import { EscrowModule } from './modules/escrow/escrow.module';
import { ChatMessageModule } from './modules/chat-message/chat-message.module';
import { StellarModule } from './modules/stellar/stellar.module';
import { KycModule } from './modules/kyc/kyc.module';
import { AuthModule } from './modules/auth/auth.module';
import { PaymentProvidersModule } from './modules/payment-providers/payment-providers.module';
import { SendModule } from './modules/send/send.module';
import { StatsModule } from './modules/stats/stats.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    OfferModule,
    PaymentMethodsModule,
    OrderModule,
    EscrowModule,
    ChatMessageModule,
    StellarModule,
    KycModule,
    AuthModule,
    PaymentProvidersModule,
    SendModule,
    StatsModule,
    AuditLogModule,
    // Note: The default ThrottlerModule uses in-memory storage, which does not synchronize
    // across multiple Node.js processes. For production deployments with multiple replicas
    // (e.g. horizontally scaled), you MUST configure a shared storage provider like Redis
    // using @nestjs/throttler-storage-redis to ensure limits are enforced globally.
    ThrottlerModule.forRootAsync({
      useFactory: () => [
        {
          name: 'default',
          ttl: parseInt(process.env.RATE_LIMIT_DEFAULT_TTL_MS || '60000', 10),
          limit: parseInt(process.env.RATE_LIMIT_DEFAULT_MAX || '100', 10),
        },
      ],
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
