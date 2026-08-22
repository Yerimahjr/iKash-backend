import { Module } from '@nestjs/common';
import { OfferController } from './offer.controller';
import { OfferRepository } from './offer.repository';
import { OfferService } from './offer.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
@Module({
  imports: [AuditLogModule],
  controllers: [OfferController],
  providers: [OfferService, OfferRepository],
})
export class OfferModule {}
