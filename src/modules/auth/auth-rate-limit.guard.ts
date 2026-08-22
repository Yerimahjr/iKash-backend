import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException, ErrorCode } from '../../common/errors';

interface RateLimitWindow {
  count: number;
  windowStart: number;
}

/**
 * Lightweight in-memory fixed-window rate limiter for the authentication
 * endpoints, keyed by route + client IP. It blunts brute-force attempts
 * against the challenge-response flow without introducing an external
 * dependency or shared store.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  static readonly WINDOW_MS = 60_000;
  static readonly MAX_ATTEMPTS = 10;

  private readonly windows = new Map<string, RateLimitWindow>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `${request.path}:${request.ip ?? 'unknown'}`;

    const now = Date.now();
    const window = this.windows.get(key);

    if (!window || now - window.windowStart >= AuthRateLimitGuard.WINDOW_MS) {
      this.pruneExpired(now);
      this.windows.set(key, { count: 1, windowStart: now });
      return true;
    }

    window.count += 1;
    if (window.count > AuthRateLimitGuard.MAX_ATTEMPTS) {
      throw new AppException(
        ErrorCode.TOO_MANY_REQUESTS,
        'Too many authentication attempts. Please try again later.',
      );
    }
    return true;
  }

  reset(): void {
    this.windows.clear();
  }

  private pruneExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.windowStart >= AuthRateLimitGuard.WINDOW_MS) {
        this.windows.delete(key);
      }
    }
  }
}
