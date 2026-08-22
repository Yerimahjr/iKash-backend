import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerModule, SkipThrottle, Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../src/common/guards/custom-throttler.guard';
import { APP_GUARD } from '@nestjs/core';

@Controller('test')
class TestController {
  @Get('global')
  globalRoute() {
    return 'global';
  }

  @SkipThrottle()
  @Get('skipped')
  skippedRoute() {
    return 'skipped';
  }

  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @Get('strict')
  strictRoute() {
    return 'strict';
  }
}

describe('Rate Limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            name: 'default',
            ttl: 60000,
            limit: 3,
          },
        ]),
      ],
      controllers: [TestController],
      providers: [
        {
          provide: APP_GUARD,
          useClass: CustomThrottlerGuard,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should enforce global rate limits', async () => {
    // 3 requests allowed, 4th fails
    await request(app.getHttpServer()).get('/test/global').expect(200);
    await request(app.getHttpServer()).get('/test/global').expect(200);
    await request(app.getHttpServer()).get('/test/global').expect(200);

    const res = await request(app.getHttpServer()).get('/test/global');
    expect(res.status).toBe(429);
    expect((res.body as { message: string }).message).toBe(
      'Too many requests. Please try again later.',
    );
  });

  it('should skip rate limits for @SkipThrottle routes', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/test/skipped').expect(200);
    }
  });

  it('should enforce strict rate limits for @Throttle routes', async () => {
    // 2 requests allowed, 3rd fails
    await request(app.getHttpServer()).get('/test/strict').expect(200);
    await request(app.getHttpServer()).get('/test/strict').expect(200);

    const res = await request(app.getHttpServer()).get('/test/strict');
    expect(res.status).toBe(429);
    expect((res.body as { message: string }).message).toBe(
      'Too many requests. Please try again later.',
    );
  });
});
