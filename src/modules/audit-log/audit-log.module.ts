import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuditLogService } from './audit-log.service';
import { AuditLogRepository } from './audit-log.repository';

/**
 * Exports `AuditLogService` so any other module can inject it to record
 * audit events for its own critical actions, without needing to know
 * about `AuditLogRepository` or the underlying Prisma model.
 */
@Module({
  imports: [PrismaModule],
  providers: [AuditLogService, AuditLogRepository],
  exports: [AuditLogService],
})
export class AuditLogModule {}
