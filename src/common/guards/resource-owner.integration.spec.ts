import {
  Controller,
  Get,
  INestApplication,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { ResourceOwnerGuard } from './resource-owner.guard';
import { ResourceOwner } from '../decorators/resource-owner.decorator';
import { ResourceType } from '../interfaces/resource-owner.interface';
import { HttpExceptionFilter } from '../errors';
import { PrismaService } from '../../../prisma/prisma.service';

type PrismaMock = {
  appUser: { findUnique: jest.Mock };
  order: { findUnique: jest.Mock };
  escrowOnChain: { findUnique: jest.Mock };
  chatMessage: { findUnique: jest.Mock };
  paymentMethod: { findUnique: jest.Mock };
};

@Controller()
@UseGuards(ResourceOwnerGuard)
class TestResourceController {
  @Get('public/:id')
  getPublic(@Param('id') id: string) {
    return { id, type: 'public' };
  }

  @Get('orders/:id')
  @ResourceOwner(ResourceType.ORDER)
  getOrder(@Param('id') id: string) {
    return { id, type: 'order' };
  }

  @Get('escrows/:id')
  @ResourceOwner(ResourceType.ESCROW)
  getEscrow(@Param('id') id: string) {
    return { id, type: 'escrow' };
  }

  @Get('chat-messages/:id')
  @ResourceOwner(ResourceType.CHAT_MESSAGE)
  getChatMessage(@Param('id') id: string) {
    return { id, type: 'chat_message' };
  }

  @Get('payment-methods/:id')
  @ResourceOwner(ResourceType.PAYMENT_METHOD)
  getPaymentMethod(@Param('id') id: string) {
    return { id, type: 'payment_method' };
  }
}

describe('ResourceOwnerGuard (integration)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      appUser: { findUnique: jest.fn() },
      order: { findUnique: jest.fn() },
      escrowOnChain: { findUnique: jest.fn() },
      chatMessage: { findUnique: jest.fn() },
      paymentMethod: { findUnique: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TestResourceController],
      providers: [
        Reflector,
        ResourceOwnerGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());

    // Stand-in for the real auth guard/middleware: attaches req.user from a
    // header so we can drive the request as different callers over HTTP.
    app.use(
      (
        req: { headers: Record<string, string | undefined>; user?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        const userId = req.headers['x-user-id'];
        if (userId) {
          req.user = { userId };
        }
        next();
      },
    );

    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows unauthenticated access to routes without @ResourceOwner metadata', async () => {
    await request(server).get('/public/anything').expect(200, {
      id: 'anything',
      type: 'public',
    });
    expect(prisma.appUser.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 UNAUTHORIZED_ACTION when there is no authenticated user', async () => {
    const response = await request(server).get('/orders/order-1').expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      error: 'UNAUTHORIZED_ACTION',
    });
  });

  it('returns 200 when the requester is the buyer on the order', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.order.findUnique.mockResolvedValue({
      buyerId: 'user-1',
      sellerId: 'user-2',
    });

    await request(server)
      .get('/orders/order-1')
      .set('x-user-id', 'user-1')
      .expect(200, { id: 'order-1', type: 'order' });
  });

  it('returns 200 when the requester is the seller on the order', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.order.findUnique.mockResolvedValue({
      buyerId: 'user-2',
      sellerId: 'user-1',
    });

    await request(server)
      .get('/orders/order-1')
      .set('x-user-id', 'user-1')
      .expect(200, { id: 'order-1', type: 'order' });
  });

  it('returns 403 UNAUTHORIZED_ACTION when the requester is neither buyer nor seller', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.order.findUnique.mockResolvedValue({
      buyerId: 'user-2',
      sellerId: 'user-3',
    });

    const response = await request(server)
      .get('/orders/order-1')
      .set('x-user-id', 'user-1')
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      error: 'UNAUTHORIZED_ACTION',
    });
  });

  it('returns 404 ORDER_NOT_FOUND when the order does not exist', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.order.findUnique.mockResolvedValue(null);

    const response = await request(server)
      .get('/orders/missing-order')
      .set('x-user-id', 'user-1')
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'ORDER_NOT_FOUND',
    });
  });

  it('lets an admin bypass ownership checks without querying the resource', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'admin' });

    await request(server)
      .get('/orders/order-1')
      .set('x-user-id', 'admin-1')
      .expect(200, { id: 'order-1', type: 'order' });

    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('lets a support user bypass ownership checks without querying the resource', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'support' });

    await request(server)
      .get('/orders/order-1')
      .set('x-user-id', 'support-1')
      .expect(200, { id: 'order-1', type: 'order' });

    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('resolves escrow ownership through the related order', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.escrowOnChain.findUnique.mockResolvedValue({
      order: { buyerId: 'user-1', sellerId: 'user-2' },
    });

    await request(server)
      .get('/escrows/escrow-1')
      .set('x-user-id', 'user-1')
      .expect(200, { id: 'escrow-1', type: 'escrow' });
  });

  it('returns 403 UNAUTHORIZED_ACTION when the requester is neither buyer nor seller on the escrow order', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.escrowOnChain.findUnique.mockResolvedValue({
      order: { buyerId: 'user-2', sellerId: 'user-3' },
    });

    const response = await request(server)
      .get('/escrows/escrow-1')
      .set('x-user-id', 'user-1')
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      error: 'UNAUTHORIZED_ACTION',
    });
  });

  it('returns 404 ESCROW_NOT_FOUND when the escrow does not exist', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.escrowOnChain.findUnique.mockResolvedValue(null);

    const response = await request(server)
      .get('/escrows/missing-escrow')
      .set('x-user-id', 'user-1')
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'ESCROW_NOT_FOUND',
    });
  });

  it('resolves chat message ownership via sender or order parties', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.chatMessage.findUnique.mockResolvedValue({
      senderId: 'user-3',
      order: { buyerId: 'user-1', sellerId: 'user-2' },
    });

    await request(server)
      .get('/chat-messages/message-1')
      .set('x-user-id', 'user-1')
      .expect(200, { id: 'message-1', type: 'chat_message' });
  });

  it('returns 403 UNAUTHORIZED_ACTION when the requester is not the sender, buyer, or seller of the chat message', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.chatMessage.findUnique.mockResolvedValue({
      senderId: 'user-2',
      order: { buyerId: 'user-3', sellerId: 'user-4' },
    });

    const response = await request(server)
      .get('/chat-messages/message-1')
      .set('x-user-id', 'user-1')
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      error: 'UNAUTHORIZED_ACTION',
    });
  });

  it('returns 404 CHAT_MESSAGE_NOT_FOUND when the chat message does not exist', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.chatMessage.findUnique.mockResolvedValue(null);

    const response = await request(server)
      .get('/chat-messages/missing-message')
      .set('x-user-id', 'user-1')
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'CHAT_MESSAGE_NOT_FOUND',
    });
  });

  it('returns 200 when the requester owns the payment method', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.paymentMethod.findUnique.mockResolvedValue({ userId: 'user-1' });

    await request(server)
      .get('/payment-methods/payment-1')
      .set('x-user-id', 'user-1')
      .expect(200, { id: 'payment-1', type: 'payment_method' });
  });

  it('returns 403 UNAUTHORIZED_ACTION when the payment method belongs to another user', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.paymentMethod.findUnique.mockResolvedValue({ userId: 'user-2' });

    const response = await request(server)
      .get('/payment-methods/payment-1')
      .set('x-user-id', 'user-1')
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      error: 'UNAUTHORIZED_ACTION',
    });
  });

  it('returns 404 PAYMENT_METHOD_NOT_FOUND when the payment method does not exist', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.paymentMethod.findUnique.mockResolvedValue(null);

    const response = await request(server)
      .get('/payment-methods/missing-payment')
      .set('x-user-id', 'user-1')
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'PAYMENT_METHOD_NOT_FOUND',
    });
  });
});
