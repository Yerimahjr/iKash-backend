import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KycService } from './kyc.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AppException, AppErrorResponse, ErrorCode } from '../../common/errors';
import * as crypto from 'crypto';

describe('KycService', () => {
  let service: KycService;
  let configService: jest.Mocked<ConfigService>;

  const SECRET = 'test_webhook_secret_key';

  beforeEach(async () => {
    process.env.DIDIT_WEBHOOK_SECRET = SECRET;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        {
          provide: PrismaService,
          useValue: {
            appUser: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            createOrThrow: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'DIDIT_WEBHOOK_SECRET') return SECRET;
              return process.env[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyWebhookSignature', () => {
    const rawBodyBuffer = Buffer.from(
      JSON.stringify({ status: 'Approved', vendor_data: 'user-123' }),
    );
    const validSignature = crypto
      .createHmac('sha256', SECRET)
      .update(rawBodyBuffer)
      .digest('hex');

    it('should successfully verify a valid x-signature-v2 header', () => {
      expect(() => {
        service.verifyWebhookSignature({
          signatureV2: validSignature,
          rawBody: rawBodyBuffer,
        });
      }).not.toThrow();
    });

    it('should successfully verify a valid x-signature header (v1)', () => {
      expect(() => {
        service.verifyWebhookSignature({
          signatureV1: validSignature,
          rawBody: rawBodyBuffer,
        });
      }).not.toThrow();
    });

    it('should throw 401 KYC_WEBHOOK_INVALID_SIGNATURE on invalid v2 signature', () => {
      expect.assertions(2);
      try {
        service.verifyWebhookSignature({
          signatureV2:
            'invalid_signature_hex_value_1234567890abcdef1234567890abcdef',
          rawBody: rawBodyBuffer,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        const appErr = error as AppException;
        expect(appErr.getStatus()).toBe(401);
      }
    });

    it('should throw 401 KYC_WEBHOOK_INVALID_SIGNATURE on missing signature headers', () => {
      expect.assertions(2);
      try {
        service.verifyWebhookSignature({
          rawBody: rawBodyBuffer,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        const appErr = error as AppException;
        expect(appErr.getStatus()).toBe(401);
      }
    });

    it('should successfully verify a valid x-signature-simple header', () => {
      const payload = {
        session_id: 'sess-1',
        status: 'approved',
        webhook_type: 'verification',
      };
      const simpleStr = `:sess-1:approved:verification`;
      const expectedSimple = crypto
        .createHmac('sha256', SECRET)
        .update(simpleStr)
        .digest('hex');

      expect(() => {
        service.verifyWebhookSignature({
          signatureSimple: expectedSimple,
          rawBody: rawBodyBuffer,
          payload,
        });
      }).not.toThrow();
    });

    it('should throw 401 on invalid x-signature-simple header', () => {
      const payload = {
        session_id: 'sess-1',
        status: 'approved',
        webhook_type: 'verification',
      };
      expect.assertions(2);
      try {
        service.verifyWebhookSignature({
          signatureSimple:
            'wrong_simple_signature_1234567890abcdef1234567890abcdef',
          rawBody: rawBodyBuffer,
          payload,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        const appErr = error as AppException;
        expect(appErr.getStatus()).toBe(401);
      }
    });

    it('should throw error if rawBody is missing', () => {
      expect.assertions(2);
      try {
        service.verifyWebhookSignature({
          signatureV2: validSignature,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        const appErr = error as AppException;
        const resp = appErr.getResponse() as AppErrorResponse;
        expect(resp.error).toBe(ErrorCode.KYC_WEBHOOK_MISSING_BODY);
      }
    });

    it('should throw error if DIDIT_WEBHOOK_SECRET is not configured', () => {
      delete process.env.DIDIT_WEBHOOK_SECRET;
      configService.get.mockReturnValue(undefined);

      expect.assertions(2);
      try {
        service.verifyWebhookSignature({
          signatureV2: validSignature,
          rawBody: rawBodyBuffer,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        const appErr = error as AppException;
        const resp = appErr.getResponse() as AppErrorResponse;
        expect(resp.error).toBe(ErrorCode.KYC_WEBHOOK_SECRET_MISSING);
      }
    });

    it('should throw 401 when timestamp header is expired', () => {
      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
      expect.assertions(2);
      try {
        service.verifyWebhookSignature({
          signatureV2: validSignature,
          rawBody: rawBodyBuffer,
          timestamp: oldTimestamp,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        const appErr = error as AppException;
        expect(appErr.getStatus()).toBe(401);
      }
    });
  });
});
