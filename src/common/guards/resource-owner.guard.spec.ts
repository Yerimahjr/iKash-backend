import { ExecutionContext } from '@nestjs/common';
import { ResourceOwnerGuard } from './resource-owner.guard';
import { ResourceType } from '../interfaces/resource-owner.interface';
import { AppException, ErrorCode } from '../errors';

describe('ResourceOwnerGuard', () => {
  let guard: ResourceOwnerGuard;
  let reflector: { get: jest.Mock };
  let prisma: {
    appUser: { findUnique: jest.Mock };
    order: { findUnique: jest.Mock };
    escrowOnChain: { findUnique: jest.Mock };
    chatMessage: { findUnique: jest.Mock };
    paymentMethod: { findUnique: jest.Mock };
  };

  const buildContext = (
    userId: string | undefined,
    params: Record<string, string>,
  ): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: userId ? { userId } : undefined,
          params,
        }),
      }),
    }) as unknown as ExecutionContext;

  const errorCodeOf = (err: unknown): unknown =>
    (err as AppException).getResponse &&
    (err as AppException).getResponse()['error' as never];

  beforeEach(() => {
    reflector = { get: jest.fn() };
    prisma = {
      appUser: { findUnique: jest.fn() },
      order: { findUnique: jest.fn() },
      escrowOnChain: { findUnique: jest.fn() },
      chatMessage: { findUnique: jest.fn() },
      paymentMethod: { findUnique: jest.fn() },
    };
    guard = new ResourceOwnerGuard(reflector as never, prisma as never);
  });

  it('allows the request through when no @ResourceOwner metadata is set', async () => {
    reflector.get.mockReturnValue(undefined);
    const context = buildContext('user-1', { id: 'order-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.appUser.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when there is no authenticated user', async () => {
    reflector.get.mockReturnValue({ type: ResourceType.ORDER, paramKey: 'id' });
    const context = buildContext(undefined, { id: 'order-1' });

    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(errorCodeOf(error)).toBe(ErrorCode.UNAUTHORIZED_ACTION);
  });

  it('allows access when the user is the buyer on the order', async () => {
    reflector.get.mockReturnValue({ type: ResourceType.ORDER, paramKey: 'id' });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.order.findUnique.mockResolvedValue({
      buyerId: 'user-1',
      sellerId: 'user-2',
    });
    const context = buildContext('user-1', { id: 'order-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows access when the user is the seller on the order', async () => {
    reflector.get.mockReturnValue({ type: ResourceType.ORDER, paramKey: 'id' });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.order.findUnique.mockResolvedValue({
      buyerId: 'user-2',
      sellerId: 'user-1',
    });
    const context = buildContext('user-1', { id: 'order-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects with 403 when the user is neither buyer nor seller', async () => {
    reflector.get.mockReturnValue({ type: ResourceType.ORDER, paramKey: 'id' });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.order.findUnique.mockResolvedValue({
      buyerId: 'user-2',
      sellerId: 'user-3',
    });
    const context = buildContext('user-1', { id: 'order-1' });

    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(errorCodeOf(error)).toBe(ErrorCode.UNAUTHORIZED_ACTION);
  });

  it('rejects with 404 when the order does not exist', async () => {
    reflector.get.mockReturnValue({ type: ResourceType.ORDER, paramKey: 'id' });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.order.findUnique.mockResolvedValue(null);
    const context = buildContext('user-1', { id: 'missing-order' });

    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(errorCodeOf(error)).toBe(ErrorCode.ORDER_NOT_FOUND);
  });

  it('allows admins to bypass ownership checks without querying the resource', async () => {
    reflector.get.mockReturnValue({ type: ResourceType.ORDER, paramKey: 'id' });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'admin' });
    const context = buildContext('admin-1', { id: 'order-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('allows support users to bypass ownership checks', async () => {
    reflector.get.mockReturnValue({ type: ResourceType.ORDER, paramKey: 'id' });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'support' });
    const context = buildContext('support-1', { id: 'order-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('resolves escrow ownership through the related order', async () => {
    reflector.get.mockReturnValue({
      type: ResourceType.ESCROW,
      paramKey: 'id',
    });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.escrowOnChain.findUnique.mockResolvedValue({
      order: { buyerId: 'user-1', sellerId: 'user-2' },
    });
    const context = buildContext('user-1', { id: 'escrow-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects with 404 when the escrow does not exist', async () => {
    reflector.get.mockReturnValue({
      type: ResourceType.ESCROW,
      paramKey: 'id',
    });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.escrowOnChain.findUnique.mockResolvedValue(null);
    const context = buildContext('user-1', { id: 'missing-escrow' });

    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(errorCodeOf(error)).toBe(ErrorCode.ESCROW_NOT_FOUND);
  });

  it('rejects with 403 when the user is neither buyer nor seller on the escrow order', async () => {
    reflector.get.mockReturnValue({
      type: ResourceType.ESCROW,
      paramKey: 'id',
    });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.escrowOnChain.findUnique.mockResolvedValue({
      order: { buyerId: 'user-2', sellerId: 'user-3' },
    });
    const context = buildContext('user-1', { id: 'escrow-1' });

    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(errorCodeOf(error)).toBe(ErrorCode.UNAUTHORIZED_ACTION);
  });

  it('resolves chat message ownership via sender or order parties', async () => {
    reflector.get.mockReturnValue({
      type: ResourceType.CHAT_MESSAGE,
      paramKey: 'id',
    });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.chatMessage.findUnique.mockResolvedValue({
      senderId: 'user-3',
      order: { buyerId: 'user-1', sellerId: 'user-2' },
    });
    const context = buildContext('user-1', { id: 'message-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows access when the user is the sender but not the buyer or seller', async () => {
    reflector.get.mockReturnValue({
      type: ResourceType.CHAT_MESSAGE,
      paramKey: 'id',
    });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.chatMessage.findUnique.mockResolvedValue({
      senderId: 'user-1',
      order: { buyerId: 'user-2', sellerId: 'user-3' },
    });
    const context = buildContext('user-1', { id: 'message-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects with 403 when the user is not the sender, buyer, or seller of the chat message', async () => {
    reflector.get.mockReturnValue({
      type: ResourceType.CHAT_MESSAGE,
      paramKey: 'id',
    });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.chatMessage.findUnique.mockResolvedValue({
      senderId: 'user-2',
      order: { buyerId: 'user-3', sellerId: 'user-4' },
    });
    const context = buildContext('user-1', { id: 'message-1' });

    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(errorCodeOf(error)).toBe(ErrorCode.UNAUTHORIZED_ACTION);
  });

  it('rejects with 404 when the chat message does not exist', async () => {
    reflector.get.mockReturnValue({
      type: ResourceType.CHAT_MESSAGE,
      paramKey: 'id',
    });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.chatMessage.findUnique.mockResolvedValue(null);
    const context = buildContext('user-1', { id: 'missing-message' });

    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(errorCodeOf(error)).toBe(ErrorCode.CHAT_MESSAGE_NOT_FOUND);
  });

  it('resolves payment method ownership by userId', async () => {
    reflector.get.mockReturnValue({
      type: ResourceType.PAYMENT_METHOD,
      paramKey: 'id',
    });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.paymentMethod.findUnique.mockResolvedValue({ userId: 'user-1' });
    const context = buildContext('user-1', { id: 'payment-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects when the payment method belongs to a different user', async () => {
    reflector.get.mockReturnValue({
      type: ResourceType.PAYMENT_METHOD,
      paramKey: 'id',
    });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.paymentMethod.findUnique.mockResolvedValue({ userId: 'user-2' });
    const context = buildContext('user-1', { id: 'payment-1' });

    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(errorCodeOf(error)).toBe(ErrorCode.UNAUTHORIZED_ACTION);
  });

  it('rejects with 404 when the payment method does not exist', async () => {
    reflector.get.mockReturnValue({
      type: ResourceType.PAYMENT_METHOD,
      paramKey: 'id',
    });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.paymentMethod.findUnique.mockResolvedValue(null);
    const context = buildContext('user-1', { id: 'missing-payment' });

    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(errorCodeOf(error)).toBe(ErrorCode.PAYMENT_METHOD_NOT_FOUND);
  });

  it('resolves the requester id from request.user.id when userId is absent', async () => {
    reflector.get.mockReturnValue({ type: ResourceType.ORDER, paramKey: 'id' });
    prisma.appUser.findUnique.mockResolvedValue({ role: 'user' });
    prisma.order.findUnique.mockResolvedValue({
      buyerId: 'user-1',
      sellerId: 'user-2',
    });
    const context = {
      getHandler: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'user-1' },
          params: { id: 'order-1' },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('falls through to ownership resolution when the requester has no AppUser record', async () => {
    reflector.get.mockReturnValue({ type: ResourceType.ORDER, paramKey: 'id' });
    prisma.appUser.findUnique.mockResolvedValue(null);
    prisma.order.findUnique.mockResolvedValue({
      buyerId: 'user-1',
      sellerId: 'user-2',
    });
    const context = buildContext('user-1', { id: 'order-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.order.findUnique).toHaveBeenCalled();
  });
});
