import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ExecutionContext,
} from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { TrustlessWorkService } from '../src/modules/escrow/trustless-work.service';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import { ResourceOwnerGuard } from '../src/common/guards/resource-owner.guard';

interface EscrowSyncResponse {
  escrowId: string;
  status: string;
  contractId?: string;
  newEscrowStatus: string;
}

interface FiatSentResponse {
  escrowId: string;
  unsignedTransaction: string;
}

interface EscrowStatusResponse {
  onChainBalance: unknown;
  onChainData: unknown;
}

interface ErrorResponse {
  statusCode: number;
  error: string;
}

describe('Escrow (e2e) - open -> fund -> fiat_sent -> release', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tw = {
    sendTransaction: jest.fn(),
    getEscrowBalance: jest.fn(),
    getEscrowByContractId: jest.fn(),
    changeMilestoneStatus: jest.fn(),
  };

  let buyerId: string;
  let sellerId: string;
  let offerId: string;
  let orderId: string;
  let escrowId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TrustlessWorkService)
      .useValue(tw)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx
            .switchToHttp()
            .getRequest<{ user?: { userId: string } }>();
          req.user = { userId: buyerId };
          return true;
        },
      })
      .overrideGuard(ResourceOwnerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const buyer = await prisma.appUser.create({
      data: { publicKey: `GBUYER${Date.now()}${Math.random()}` },
    });
    const seller = await prisma.appUser.create({
      data: { publicKey: `GSELLER${Date.now()}${Math.random()}` },
    });
    buyerId = buyer.userId;
    sellerId = seller.userId;

    const offer = await prisma.offer.create({
      data: {
        creatorId: sellerId,
        type: 'sell',
        assetCode: 'USDC',
        price: 1,
        minAmount: 1,
        maxAmount: 1000,
      },
    });
    offerId = offer.offerId;

    const order = await prisma.order.create({
      data: {
        offerId,
        buyerId,
        sellerId,
        assetAmount: 100,
        fiatAmount: 100,
      },
    });
    orderId = order.orderId;

    const escrow = await prisma.escrowOnChain.create({
      data: {
        orderId,
        escrowStatus: 'pending',
        buyerAddress: buyer.publicKey,
        sellerAddress: seller.publicKey,
        amount: 100,
      },
    });
    escrowId = escrow.escrowId;
  });

  afterEach(async () => {
    // Clean up only the rows this test created, to avoid colliding with
    // other e2e suites running in parallel against the same database.
    await prisma.escrowOnChain.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { orderId } });
    await prisma.offer.deleteMany({ where: { offerId } });
    await prisma.appUser.deleteMany({
      where: { userId: { in: [buyerId, sellerId] } },
    });
  });

  it('walks the full happy path: pending -> initialize -> funded -> fiat_sent -> release', async () => {
    tw.sendTransaction.mockResolvedValueOnce({
      status: 'SUCCESS',
      contractId: 'CONTRACTABC123',
    });

    let res = await request(app.getHttpServer())
      .post('/escrows/sync')
      .send({ escrowId, signedXdr: 'signed-init-xdr', action: 'initialize' })
      .expect(201);

    const initBody = res.body as EscrowSyncResponse;
    expect(initBody.newEscrowStatus).toBe('initialized');
    expect(initBody.contractId).toBe('CONTRACTABC123');

    let escrowRow = await prisma.escrowOnChain.findUniqueOrThrow({
      where: { escrowId },
    });
    expect(escrowRow.escrowStatus).toBe('initialized');
    expect(escrowRow.txHashLock).toBeTruthy();

    tw.sendTransaction.mockResolvedValueOnce({ status: 'SUCCESS' });

    res = await request(app.getHttpServer())
      .post('/escrows/sync')
      .send({ escrowId, signedXdr: 'signed-fund-xdr', action: 'fund' })
      .expect(201);

    expect((res.body as EscrowSyncResponse).newEscrowStatus).toBe('funded');

    escrowRow = await prisma.escrowOnChain.findUniqueOrThrow({
      where: { escrowId },
    });
    expect(escrowRow.escrowStatus).toBe('funded');

    tw.changeMilestoneStatus.mockResolvedValueOnce({
      unsignedTransaction: 'unsigned-fiat-sent-xdr',
    });

    const fiatSentRes = await request(app.getHttpServer())
      .post(`/escrows/${escrowId}/fiat-sent`)
      .send({ buyerAddress: escrowRow.buyerAddress })
      .expect(201);

    expect((fiatSentRes.body as FiatSentResponse).unsignedTransaction).toBe(
      'unsigned-fiat-sent-xdr',
    );
    expect(tw.changeMilestoneStatus).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 'CONTRACTABC123' }),
    );

    escrowRow = await prisma.escrowOnChain.findUniqueOrThrow({
      where: { escrowId },
    });
    expect(escrowRow.escrowStatus).toBe('funded');

    tw.sendTransaction.mockResolvedValueOnce({ status: 'SUCCESS' });

    res = await request(app.getHttpServer())
      .post('/escrows/sync')
      .send({
        escrowId,
        signedXdr: 'signed-fiat-sent-xdr',
        action: 'fiat_sent',
      })
      .expect(201);

    expect((res.body as EscrowSyncResponse).newEscrowStatus).toBe('fiat_sent');

    escrowRow = await prisma.escrowOnChain.findUniqueOrThrow({
      where: { escrowId },
    });
    expect(escrowRow.escrowStatus).toBe('fiat_sent');

    tw.sendTransaction.mockResolvedValueOnce({ status: 'SUCCESS' });
    tw.getEscrowBalance.mockResolvedValueOnce({ balance: '0' });
    tw.getEscrowByContractId.mockResolvedValueOnce({ status: 'released' });

    res = await request(app.getHttpServer())
      .post('/escrows/sync')
      .send({ escrowId, signedXdr: 'signed-release-xdr', action: 'release' })
      .expect(201);

    expect((res.body as EscrowSyncResponse).newEscrowStatus).toBe('released');

    escrowRow = await prisma.escrowOnChain.findUniqueOrThrow({
      where: { escrowId },
    });
    expect(escrowRow.escrowStatus).toBe('released');
    expect(escrowRow.txHashRelease).toBeTruthy();

    const statusRes = await request(app.getHttpServer())
      .get(`/escrows/${escrowId}/status`)
      .expect(200);

    expect((statusRes.body as EscrowStatusResponse).onChainBalance).toEqual({
      balance: '0',
    });
    expect((statusRes.body as EscrowStatusResponse).onChainData).toEqual({
      status: 'released',
    });
  });

  it('rejects fund before initialize (invalid transition)', async () => {
    const res = await request(app.getHttpServer())
      .post('/escrows/sync')
      .send({ escrowId, signedXdr: 'irrelevant', action: 'fund' })
      .expect(400);

    expect((res.body as ErrorResponse).error).toBe('ESCROW_INVALID_STATUS');
    expect(tw.sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects release before funded/fiat_sent (invalid transition)', async () => {
    const res = await request(app.getHttpServer())
      .post('/escrows/sync')
      .send({ escrowId, signedXdr: 'irrelevant', action: 'release' })
      .expect(400);

    expect((res.body as ErrorResponse).error).toBe('ESCROW_INVALID_STATUS');
  });

  it('rejects fiat_sent sync before funded (invalid transition)', async () => {
    const res = await request(app.getHttpServer())
      .post('/escrows/sync')
      .send({ escrowId, signedXdr: 'irrelevant', action: 'fiat_sent' })
      .expect(400);

    expect((res.body as ErrorResponse).error).toBe('ESCROW_INVALID_STATUS');
  });

  it('rejects the /fiat-sent endpoint when escrow is still pending', async () => {
    const res = await request(app.getHttpServer())
      .post(`/escrows/${escrowId}/fiat-sent`)
      .send({ buyerAddress: 'GBUYERXYZ' })
      .expect(400);

    expect((res.body as ErrorResponse).error).toBe('ESCROW_INVALID_STATUS');
    expect(tw.changeMilestoneStatus).not.toHaveBeenCalled();
  });

  it('surfaces a sync failure when the blockchain transaction does not succeed', async () => {
    tw.sendTransaction.mockResolvedValueOnce({
      status: 'FAILED',
      message: 'insufficient fee',
    });

    const res = await request(app.getHttpServer())
      .post('/escrows/sync')
      .send({ escrowId, signedXdr: 'bad-xdr', action: 'initialize' })
      .expect(500);

    expect((res.body as ErrorResponse).error).toBe('ESCROW_SYNC_FAILED');

    const escrowRow = await prisma.escrowOnChain.findUniqueOrThrow({
      where: { escrowId },
    });
    expect(escrowRow.escrowStatus).toBe('pending');
  });

  it('documents current behavior: orderStatus does not sync with escrowStatus on release', async () => {
    tw.sendTransaction.mockResolvedValueOnce({
      status: 'SUCCESS',
      contractId: 'C1',
    });
    await request(app.getHttpServer())
      .post('/escrows/sync')
      .send({ escrowId, signedXdr: 'x1', action: 'initialize' })
      .expect(201);

    tw.sendTransaction.mockResolvedValueOnce({ status: 'SUCCESS' });
    await request(app.getHttpServer())
      .post('/escrows/sync')
      .send({ escrowId, signedXdr: 'x2', action: 'fund' })
      .expect(201);

    tw.sendTransaction.mockResolvedValueOnce({ status: 'SUCCESS' });
    await request(app.getHttpServer())
      .post('/escrows/sync')
      .send({ escrowId, signedXdr: 'x3', action: 'release' })
      .expect(201);

    const escrowRow = await prisma.escrowOnChain.findUniqueOrThrow({
      where: { escrowId },
    });
    const orderRow = await prisma.order.findUniqueOrThrow({
      where: { orderId },
    });

    expect(escrowRow.escrowStatus).toBe('released');
    expect(orderRow.orderStatus).toBe('created');
  });
});
