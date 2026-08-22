import { Test, TestingModule } from '@nestjs/testing';
import { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AppException, ErrorCode } from '../../common/errors';

describe('KycController', () => {
  let controller: KycController;
  let kycService: jest.Mocked<KycService>;
  let prismaService: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KycController],
      providers: [
        {
          provide: KycService,
          useValue: {
            initializeSession: jest.fn(),
            verifyWebhookSignature: jest.fn(),
            processWebhookEvent: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            appUser: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    controller = module.get<KycController>(KycController);
    kycService = module.get(KycService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleWebhook', () => {
    it('should verify signature and process webhook event on valid request', async () => {
      const payload = { vendor_data: 'user-uuid-123', status: 'approved' };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const req = { rawBody } as unknown as RawBodyRequest<Request>;

      const verifySpy = jest
        .spyOn(kycService, 'verifyWebhookSignature')
        .mockImplementation(() => {});
      const processSpy = jest
        .spyOn(kycService, 'processWebhookEvent')
        .mockResolvedValue(undefined);

      const result = await controller.handleWebhook(
        'v2_sig',
        'v1_sig',
        'simple_sig',
        '1700000000',
        req,
        payload,
      );

      expect(verifySpy).toHaveBeenCalledWith({
        signatureV2: 'v2_sig',
        signatureV1: 'v1_sig',
        signatureSimple: 'simple_sig',
        timestamp: '1700000000',
        rawBody,
        payload,
      });

      expect(processSpy).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ received: true });
    });

    it('should not process webhook event if verifyWebhookSignature throws an error', async () => {
      const payload = { vendor_data: 'user-uuid-123', status: 'approved' };
      const req = {
        rawBody: Buffer.from(JSON.stringify(payload)),
      } as unknown as RawBodyRequest<Request>;

      jest
        .spyOn(kycService, 'verifyWebhookSignature')
        .mockImplementation(() => {
          throw new AppException(
            ErrorCode.KYC_WEBHOOK_INVALID_SIGNATURE,
            'Invalid webhook signature',
          );
        });
      const processSpy = jest.spyOn(kycService, 'processWebhookEvent');

      await expect(
        controller.handleWebhook('bad_sig', '', '', '', req, payload),
      ).rejects.toThrow(AppException);

      expect(processSpy).not.toHaveBeenCalled();
    });
  });

  describe('startKyc', () => {
    it('should throw MISSING_USER_ID if userId is missing', async () => {
      await expect(controller.startKyc('')).rejects.toThrow(AppException);
    });

    it('should initialize session when userId is provided', async () => {
      jest.spyOn(kycService, 'initializeSession').mockResolvedValue({
        sessionUrl: 'https://didit.me/sess',
      });
      const res = await controller.startKyc('user-1');
      expect(res).toEqual({ sessionUrl: 'https://didit.me/sess' });
    });
  });

  describe('getKycStatus', () => {
    it('should throw MISSING_USER_ID if userId query param is empty', async () => {
      await expect(controller.getKycStatus('')).rejects.toThrow(AppException);
    });

    it('should return pending if user is not found', async () => {
      (prismaService.appUser.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await controller.getKycStatus('non-existent');
      expect(res).toEqual({ kycStatus: 'pending', kycUpdatedAt: null });
    });
  });
});
