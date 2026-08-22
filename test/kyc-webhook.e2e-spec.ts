import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../src/modules/audit-log/audit-log.service';
import { TrustlessWorkService } from '../src/modules/escrow/trustless-work.service';
import * as crypto from 'crypto';

describe('KYC Webhook Verification (e2e)', () => {
  let app: INestApplication;
  const SECRET = 'e2e_test_didit_webhook_secret';

  beforeAll(async () => {
    process.env.DIDIT_WEBHOOK_SECRET = SECRET;
    process.env.TRUSTLESS_WORK_API_URL = 'https://api.trustlesswork.com';
    process.env.TRUSTLESS_WORK_API_KEY = 'test_key';
    process.env.JWT_SECRET = 'test_jwt_secret';
    process.env.STELLAR_NETWORK = 'TESTNET';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        appUser: {
          findUnique: jest.fn().mockResolvedValue({
            userId: '00000000-0000-0000-0000-000000000001',
            kycStatus: 'pending',
          }),
          update: jest.fn().mockResolvedValue({
            userId: '00000000-0000-0000-0000-000000000001',
            kycStatus: 'approved',
          }),
        },
      })
      .overrideProvider(AuditLogService)
      .useValue({
        createOrThrow: jest.fn().mockResolvedValue({}),
      })
      .overrideProvider(TrustlessWorkService)
      .useValue({
        getEscrowBalance: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /kyc/webhook - should return 401 Unauthorized when signature is missing', async () => {
    const server = app.getHttpServer() as App;
    const response = await request(server).post('/kyc/webhook').send({
      status: 'approved',
      vendor_data: '00000000-0000-0000-0000-000000000001',
    });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('statusCode', 401);
    expect(response.body).toHaveProperty(
      'error',
      'KYC_WEBHOOK_INVALID_SIGNATURE',
    );
  });

  it('POST /kyc/webhook - should return 401 Unauthorized when signature is invalid', async () => {
    const server = app.getHttpServer() as App;
    const response = await request(server)
      .post('/kyc/webhook')
      .set(
        'x-signature-v2',
        'invalid_signature_hex_000000000000000000000000000000000000',
      )
      .send({
        status: 'approved',
        vendor_data: '00000000-0000-0000-0000-000000000001',
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('statusCode', 401);
    expect(response.body).toHaveProperty(
      'error',
      'KYC_WEBHOOK_INVALID_SIGNATURE',
    );
  });

  it('POST /kyc/webhook - should return 200 OK when valid x-signature-v2 is provided', async () => {
    const payload = JSON.stringify({
      status: 'approved',
      vendor_data: '00000000-0000-0000-0000-000000000001',
    });
    const validSignature = crypto
      .createHmac('sha256', SECRET)
      .update(payload)
      .digest('hex');

    const server = app.getHttpServer() as App;
    const response = await request(server)
      .post('/kyc/webhook')
      .set('Content-Type', 'application/json')
      .set('x-signature-v2', validSignature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });
});
