import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { OrderCron } from './order.cron';
import { EscrowModule } from '../escrow/escrow.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
@Module({
  imports: [EscrowModule, AuditLogModule],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository, OrderCron],
})
export class OrderModule {}
