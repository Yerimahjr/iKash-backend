import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { AppException, ErrorCode } from '../errors';
import { RESOURCE_OWNER_KEY } from '../decorators/resource-owner.decorator';
import {
  ResourceOwnerMetadata,
  ResourceType,
} from '../interfaces/resource-owner.interface';
import { AuthenticatedRequest } from '../../lib/types/auth';

const NOT_FOUND_ERROR_BY_TYPE: Record<ResourceType, ErrorCode> = {
  [ResourceType.ORDER]: ErrorCode.ORDER_NOT_FOUND,
  [ResourceType.ESCROW]: ErrorCode.ESCROW_NOT_FOUND,
  [ResourceType.CHAT_MESSAGE]: ErrorCode.CHAT_MESSAGE_NOT_FOUND,
  [ResourceType.PAYMENT_METHOD]: ErrorCode.PAYMENT_METHOD_NOT_FOUND,
};

const PRIVILEGED_ROLES: ReadonlySet<string> = new Set(['admin', 'support']);

@Injectable()
export class ResourceOwnerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.get<ResourceOwnerMetadata | undefined>(
      RESOURCE_OWNER_KEY,
      context.getHandler(),
    );

    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.userId ?? request.user?.id;

    if (!userId) {
      throw new AppException(
        ErrorCode.UNAUTHORIZED_ACTION,
        'Authentication required',
      );
    }

    const rawResourceId = request.params?.[metadata.paramKey];
    const resourceId = Array.isArray(rawResourceId)
      ? rawResourceId[0]
      : rawResourceId;
    if (!resourceId) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        `Missing required parameter: ${metadata.paramKey}`,
      );
    }

    const requester = await this.prisma.appUser.findUnique({
      where: { userId },
      select: { role: true },
    });

    if (requester && PRIVILEGED_ROLES.has(requester.role)) {
      return true;
    }

    const ownerIds = await this.resolveOwnerIds(metadata.type, resourceId);

    if (ownerIds === null) {
      throw new AppException(
        NOT_FOUND_ERROR_BY_TYPE[metadata.type],
        'Resource not found',
      );
    }

    if (!ownerIds.includes(userId)) {
      throw new AppException(
        ErrorCode.UNAUTHORIZED_ACTION,
        'You do not have access to this resource',
      );
    }

    return true;
  }

  private async resolveOwnerIds(
    type: ResourceType,
    resourceId: string,
  ): Promise<string[] | null> {
    switch (type) {
      case ResourceType.ORDER: {
        const order = await this.prisma.order.findUnique({
          where: { orderId: resourceId },
          select: { buyerId: true, sellerId: true },
        });
        return order ? [order.buyerId, order.sellerId] : null;
      }

      case ResourceType.ESCROW: {
        const escrow = await this.prisma.escrowOnChain.findUnique({
          where: { escrowId: resourceId },
          select: { order: { select: { buyerId: true, sellerId: true } } },
        });
        return escrow ? [escrow.order.buyerId, escrow.order.sellerId] : null;
      }

      case ResourceType.CHAT_MESSAGE: {
        const message = await this.prisma.chatMessage.findUnique({
          where: { messageId: resourceId },
          select: {
            senderId: true,
            order: { select: { buyerId: true, sellerId: true } },
          },
        });
        return message
          ? [message.senderId, message.order.buyerId, message.order.sellerId]
          : null;
      }

      case ResourceType.PAYMENT_METHOD: {
        const paymentMethod = await this.prisma.paymentMethod.findUnique({
          where: { paymentId: resourceId },
          select: { userId: true },
        });
        return paymentMethod ? [paymentMethod.userId] : null;
      }

      default: {
        const exhaustiveCheck: never = type;
        throw new Error(
          `Unsupported resource type: ${String(exhaustiveCheck)}`,
        );
      }
    }
  }
}
