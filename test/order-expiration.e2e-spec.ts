jest.mock('@stellar/stellar-sdk', () => {
  const Horizon = {
    Server: jest.fn().mockImplementation(() => ({
      loadAccount: jest.fn(),
    })),
  };
  return {
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      PUBLIC: 'Public Global Stellar Network ; September 2015',
    },
    Horizon,
    Asset: {
      native: jest.fn(),
    },
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: jest.fn().mockReturnValue('dummy-key'),
      }),
    },
    BASE_FEE: '100',
    FeeBumpTransaction: jest.fn(),
    Memo: {
      text: jest.fn(),
    },
    Operation: {
      payment: jest.fn(),
    },
    Transaction: jest.fn(),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      addMemo: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({
        sign: jest.fn(),
        toXDR: jest.fn().mockReturnValue('dummy-xdr'),
      }),
    })),
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { OrderService } from '../src/modules/order/order.service';
import { TrustlessWorkService } from '../src/modules/escrow/trustless-work.service';

describe('Order Expiration Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orderService: OrderService;
  let twServiceMock: {
    getEscrowBalance: jest.Mock;
  };

  let buyerId: string;
  let sellerId: string;
  let offerId: string;

  beforeAll(async () => {
    twServiceMock = {
      getEscrowBalance: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TrustlessWorkService)
      .useValue(twServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    orderService = app.get<OrderService>(OrderService);

    // Seed/Ensure dummy users exist
    const buyer = await prisma.appUser.upsert({
      where: { publicKey: 'GBUYERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345' },
      update: {},
      create: {
        publicKey: 'GBUYERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        alias: 'e2eBuyer',
        kycStatus: 'approved',
      },
    });
    buyerId = buyer.userId;

    const seller = await prisma.appUser.upsert({
      where: { publicKey: 'GSELLERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345' },
      update: {},
      create: {
        publicKey: 'GSELLERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        alias: 'e2eSeller',
        kycStatus: 'approved',
      },
    });
    sellerId = seller.userId;

    // Seed/Ensure dummy offer exists
    const offer = await prisma.offer.create({
      data: {
        creatorId: sellerId,
        type: 'sell',
        assetCode: 'USDC',
        price: 1.0,
        minAmount: 1.0,
        maxAmount: 100.0,
        status: 'active',
      },
    });
    offerId = offer.offerId;
  });

  afterAll(async () => {
    // Cleanup seeded tests data
    if (buyerId && sellerId) {
      await prisma.order.deleteMany({
        where: {
          buyerId,
          sellerId,
        },
      });
      await prisma.offer.deleteMany({
        where: {
          creatorId: sellerId,
        },
      });
      await prisma.appUser.deleteMany({
        where: {
          userId: {
            in: [buyerId, sellerId],
          },
        },
      });
    }

    if (app) {
      await app.close();
    }
  });

  it('should expire and cancel correct orders while ignoring protected/future ones', async () => {
    const now = new Date();

    // 1. Order A: expired, 'created' status, no escrow -> should become 'expired'
    const orderA = await prisma.order.create({
      data: {
        offerId,
        buyerId,
        sellerId,
        assetAmount: 10,
        fiatAmount: 10,
        orderStatus: 'created',
        expiresAt: new Date(now.getTime() - 10 * 60 * 1000), // 10 mins ago
      },
    });

    // 2. Order B: expired, 'locked' status, escrow initialized (not funded) -> should become 'cancelled'
    const orderB = await prisma.order.create({
      data: {
        offerId,
        buyerId,
        sellerId,
        assetAmount: 20,
        fiatAmount: 20,
        orderStatus: 'locked',
        expiresAt: new Date(now.getTime() - 10 * 60 * 1000), // 10 mins ago
      },
    });
    const escrowB = await prisma.escrowOnChain.create({
      data: {
        orderId: orderB.orderId,
        contractId: 'CCONTACTE2EORDERB',
        buyerAddress: 'GBUYERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        sellerAddress: 'GSELLERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        amount: 20,
        escrowStatus: 'initialized',
      },
    });

    // 3. Order C: active but NOT expired (future expiresAt) -> should remain unchanged
    const orderC = await prisma.order.create({
      data: {
        offerId,
        buyerId,
        sellerId,
        assetAmount: 30,
        fiatAmount: 30,
        orderStatus: 'created',
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000), // 10 mins in future
      },
    });

    // 4. Order D: expired but has fiat_sent status in DB -> should remain protected/unchanged
    const orderD = await prisma.order.create({
      data: {
        offerId,
        buyerId,
        sellerId,
        assetAmount: 40,
        fiatAmount: 40,
        orderStatus: 'locked',
        expiresAt: new Date(now.getTime() - 10 * 60 * 1000),
      },
    });
    await prisma.escrowOnChain.create({
      data: {
        orderId: orderD.orderId,
        contractId: 'CCONTACTE2EORDERD',
        buyerAddress: 'GBUYERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        sellerAddress: 'GSELLERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        amount: 40,
        escrowStatus: 'fiat_sent',
      },
    });

    // Mock on-chain balance queries:
    // Order B on-chain balance is 0 (unfunded)
    twServiceMock.getEscrowBalance.mockImplementation((contractId: string) => {
      if (contractId === 'CCONTACTE2EORDERB') {
        return Promise.resolve([{ address: contractId, balance: 0 }]);
      }
      return Promise.resolve([]);
    });

    // Execute expiration logic
    await orderService.expireOrders();

    // Verify on-chain balance was checked for Order B (initialized escrow)
    expect(twServiceMock.getEscrowBalance).toHaveBeenCalledWith(
      'CCONTACTE2EORDERB',
    );

    // Verify on-chain balance was NOT checked for Order D (skipped at DB level due to fiat_sent status)
    expect(twServiceMock.getEscrowBalance).not.toHaveBeenCalledWith(
      'CCONTACTE2EORDERD',
    );

    // Verify order status updates
    const updatedA = await prisma.order.findUnique({
      where: { orderId: orderA.orderId },
    });
    expect(updatedA.orderStatus).toBe('expired');

    const updatedB = await prisma.order.findUnique({
      where: { orderId: orderB.orderId },
    });
    expect(updatedB.orderStatus).toBe('cancelled');

    const updatedC = await prisma.order.findUnique({
      where: { orderId: orderC.orderId },
    });
    expect(updatedC.orderStatus).toBe('created');

    const updatedD = await prisma.order.findUnique({
      where: { orderId: orderD.orderId },
    });
    expect(updatedD.orderStatus).toBe('locked');

    // Verify escrow records remain unchanged after expiration
    const escrowBAfter = await prisma.escrowOnChain.findUnique({
      where: { escrowId: escrowB.escrowId },
    });
    expect(escrowBAfter.escrowStatus).toBe('initialized');

    const escrowDAfter = await prisma.escrowOnChain.findFirst({
      where: { orderId: orderD.orderId },
    });
    expect(escrowDAfter.escrowStatus).toBe('fiat_sent');
  });
});
