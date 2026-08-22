import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EscrowController } from './escrow.controller';
import { EscrowRepository } from './escrow.repository';
import { EscrowService } from './escrow.service';
import { TrustlessWorkService } from './trustless-work.service';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
@Module({
  imports: [ConfigModule, FileStorageModule, AuditLogModule],
  controllers: [EscrowController],
  providers: [EscrowService, EscrowRepository, TrustlessWorkService],
  exports: [EscrowService],
})
export class EscrowModule {}
