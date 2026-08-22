import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderService } from './order.service';

@Injectable()
export class OrderCron {
  private readonly logger = new Logger(OrderCron.name);

  constructor(private readonly orderService: OrderService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireOrders() {
    try {
      await this.orderService.expireOrders();
    } catch (error) {
      const err = error as Error;
      this.logger.error('order.cron.expiration.failed', {
        error: err.message,
        stack: err.stack,
      });
    }
  }
}
