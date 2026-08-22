import {
  Injectable,
  Logger,
  ExecutionContext,
  HttpException,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private readonly customLogger = new Logger('RateLimiter');

  protected throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest<
      Request & {
        user?: { userId?: string; id?: string; publicKey?: string };
        body?: { publicKey?: string };
      }
    >();

    // Structured logging for rate-limit violations
    this.customLogger.warn({
      message: 'Rate limit exceeded',
      ipAddress: req.ip,
      route: req.path,
      httpMethod: req.method,
      timestamp: new Date().toISOString(),
      userId: req.user?.userId || req.user?.id || 'anonymous',
      publicKey:
        req.user?.publicKey ||
        (req.body as { publicKey?: string } | undefined)?.publicKey ||
        'unknown',
      userAgent: req.get('user-agent') || 'unknown',
      limitDetail: throttlerLimitDetail,
    });

    throw new HttpException(
      {
        statusCode: 429,
        message: 'Too many requests. Please try again later.',
        error: 'Too Many Requests',
      },
      429,
    );
  }
}
