import { ExecutionContext, HttpException } from '@nestjs/common';
import { CustomThrottlerGuard } from './custom-throttler.guard';
import { ThrottlerLimitDetail } from '@nestjs/throttler';

import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';

describe('CustomThrottlerGuard', () => {
  let guard: CustomThrottlerGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: 60000,
            limit: 10,
          },
        ]),
      ],
      providers: [CustomThrottlerGuard],
    }).compile();

    guard = module.get<CustomThrottlerGuard>(CustomThrottlerGuard);
  });

  describe('throwThrottlingException', () => {
    it('should throw an HttpException with status 429 and correct payload', async () => {
      const mockRequest = {
        ip: '127.0.0.1',
        path: '/test-route',
        method: 'POST',
        user: { userId: 'user123', publicKey: 'pk123' },
        get: jest.fn().mockReturnValue('test-agent'),
      };

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      const mockLimitDetail: ThrottlerLimitDetail = {
        totalHits: 11,
        limit: 10,
        timeToExpire: 50,
        isBlocked: true,
        ttl: 60000,
        tracker: 'tracker_id',
        key: 'test_key',
        timeToBlockExpire: 100,
      };

      const guardWithLogger = guard as unknown as {
        customLogger: { warn: jest.Mock };
      };
      const loggerSpy = jest
        .spyOn(guardWithLogger.customLogger, 'warn')
        .mockImplementation(() => {});

      expect(() =>
        guard['throwThrottlingException'](
          mockExecutionContext,
          mockLimitDetail,
        ),
      ).toThrow(HttpException);

      try {
        await guard['throwThrottlingException'](
          mockExecutionContext,
          mockLimitDetail,
        );
      } catch (err: unknown) {
        const httpError = err as HttpException;
        expect(httpError.getStatus()).toBe(429);
        expect(httpError.getResponse()).toMatchObject({
          statusCode: 429,
          message: 'Too many requests. Please try again later.',
          error: 'Too Many Requests',
        });
      }

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Rate limit exceeded',
          ipAddress: '127.0.0.1',
          route: '/test-route',
          httpMethod: 'POST',
          userId: 'user123',
          publicKey: 'pk123',
          userAgent: 'test-agent',
          limitDetail: mockLimitDetail,
        }),
      );
    });

    it('should handle missing user or body properly when logging', async () => {
      const mockRequest = {
        ip: '127.0.0.1',
        path: '/test-route',
        method: 'POST',
        get: jest.fn().mockReturnValue(undefined),
      };

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      const mockLimitDetail: ThrottlerLimitDetail = {
        totalHits: 6,
        limit: 5,
        timeToExpire: 10,
        isBlocked: true,
        ttl: 60000,
        tracker: 'tracker_id',
        key: 'test_key',
        timeToBlockExpire: 100,
      };

      const guardWithLogger = guard as unknown as {
        customLogger: { warn: jest.Mock };
      };
      const loggerSpy = jest
        .spyOn(guardWithLogger.customLogger, 'warn')
        .mockImplementation(() => {});

      try {
        await guard['throwThrottlingException'](
          mockExecutionContext,
          mockLimitDetail,
        );
      } catch {
        // expected exception
      }

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'anonymous',
          publicKey: 'unknown',
          userAgent: 'unknown',
        }),
      );
    });
  });
});
