import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { rateLimitConfig } from '../../config/rate-limit.config';
import { AuthService } from './auth.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { CreateAuthChallengeDto } from './dto/create-auth-challenge.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Step 1: issues a short-lived random challenge that the client must sign
   * with the wallet's secret key to prove ownership of the public key.
   */
  @Post('challenge')
  @UseGuards(AuthRateLimitGuard)
  createChallenge(@Body() dto: CreateAuthChallengeDto) {
    return this.authService.createChallenge(dto);
  }

  /**
   * Step 2: verifies the signed challenge and emits a temporary JWT only
   * after the signature proves ownership of the wallet. Passes request
   * context (IP, user agent) through for audit logging.
   */
  @Throttle({ default: rateLimitConfig.auth })
  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const ctx = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    return this.authService.login(dto, ctx);
  }
}
