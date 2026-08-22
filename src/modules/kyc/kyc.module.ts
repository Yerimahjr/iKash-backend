import { Module } from '@nestjs/common';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
