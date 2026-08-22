import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../common/base.repository';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ChatMessageRepository extends BaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.chatMessage, 'messageId');
  }

  findByOrder(orderId: string, skip = 0, take = 50) {
    return this.prisma.chatMessage.findMany({
      where: { orderId },
      skip,
      take,
      orderBy: { timestamp: 'asc' },
    });
  }

  findOrderParticipants(orderId: string) {
    return this.prisma.order.findUnique({
      where: { orderId },
      select: { buyerId: true, sellerId: true },
    });
  }
}
