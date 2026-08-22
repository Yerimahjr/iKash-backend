import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentMethodsRepository } from './payment-methods.repository';
import { PaymentMethodValidatorService } from './payment-method-validator.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { HttpExceptionFilter } from '../../common/errors';

describe('Payment methods (integration)', () => {
  let app: INestApplication;
  let server: Server;

  const prisma = {
    payment_provider: { findUnique: jest.fn() },
  };

  const repo = {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  };

  const auditLog = { create: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentMethodsController],
      providers: [
        PaymentMethodsService,
        PaymentMethodValidatorService,
        { provide: PaymentMethodsRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a payment method with a valid identifier for the provider', async () => {
    prisma.payment_provider.findUnique.mockResolvedValue({
      provider_id: 'provider-1',
      name: 'PayPal',
      type: 'PLATFORM',
      country_code: '',
    });
    repo.create.mockResolvedValue({
      paymentId: 'pm-1',
      userId: 'user-1',
      providerId: 'provider-1',
      accountIdentifier: 'user@example.com',
    });

    const response = await request(server)
      .post('/payment-methods')
      .send({
        userId: 'user-1',
        providerId: 'provider-1',
        accountIdentifier: 'user@example.com',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      accountIdentifier: 'user@example.com',
    });
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when the identifier does not match the provider format', async () => {
    prisma.payment_provider.findUnique.mockResolvedValue({
      provider_id: 'provider-1',
      name: 'PayPal',
      type: 'PLATFORM',
      country_code: '',
    });

    const response = await request(server)
      .post('/payment-methods')
      .send({
        userId: 'user-1',
        providerId: 'provider-1',
        accountIdentifier: 'not-an-email',
      })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'INVALID_ACCOUNT_IDENTIFIER',
      message: 'Invalid account identifier for the selected payment provider.',
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the selected provider does not exist', async () => {
    prisma.payment_provider.findUnique.mockResolvedValue(null);

    const response = await request(server)
      .post('/payment-methods')
      .send({
        userId: 'user-1',
        providerId: 'missing-provider',
        accountIdentifier: 'anything',
      })
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'PAYMENT_PROVIDER_NOT_FOUND',
    });
    expect(repo.create).not.toHaveBeenCalled();
  });
});
