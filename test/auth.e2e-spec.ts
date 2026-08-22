import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { Keypair } from '@stellar/stellar-sdk';
import { AuthModule } from '../src/modules/auth/auth.module';
import { AuthRateLimitGuard } from '../src/modules/auth/auth-rate-limit.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/errors';

interface StoredChallenge {
  challengeId: string;
  publicKey: string;
  challenge: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * In-memory stand-in for the Prisma AuthChallenge delegate so the complete
 * challenge → sign → login flow can run over HTTP without a database.
 */
class FakePrismaService {
  readonly store = new Map<string, StoredChallenge>();

  authChallenge = {
    upsert: ({
      where,
      create,
      update,
    }: {
      where: { publicKey: string };
      create: Omit<StoredChallenge, 'challengeId' | 'usedAt' | 'createdAt'>;
      update: Partial<StoredChallenge>;
    }): Promise<StoredChallenge> => {
      const existing = this.store.get(where.publicKey);
      const record: StoredChallenge = existing
        ? { ...existing, ...update }
        : {
            challengeId: `id-${this.store.size + 1}`,
            usedAt: null,
            createdAt: new Date(),
            ...create,
          };
      this.store.set(where.publicKey, record);
      return Promise.resolve(record);
    },

    findUnique: ({
      where,
    }: {
      where: { publicKey: string };
    }): Promise<StoredChallenge | null> =>
      Promise.resolve(this.store.get(where.publicKey) ?? null),

    deleteMany: ({
      where,
    }: {
      where: { expiresAt: { lt: Date } };
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const [key, record] of this.store) {
        if (record.expiresAt.getTime() < where.expiresAt.lt.getTime()) {
          this.store.delete(key);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },

    updateMany: ({
      where,
      data,
    }: {
      where: {
        publicKey: string;
        challenge: string;
        usedAt: null;
        expiresAt: { gt: Date };
      };
      data: { usedAt: Date };
    }): Promise<{ count: number }> => {
      const record = this.store.get(where.publicKey);
      if (
        !record ||
        record.challenge !== where.challenge ||
        record.usedAt !== null ||
        record.expiresAt.getTime() <= where.expiresAt.gt.getTime()
      ) {
        return Promise.resolve({ count: 0 });
      }
      record.usedAt = data.usedAt;
      return Promise.resolve({ count: 1 });
    },
  };

  readonly users = new Map<string, { userId: string; publicKey: string }>();

  appUser = {
    upsert: ({
      where,
      create,
    }: {
      where: { publicKey: string };
      create: { publicKey: string };
      update: Record<string, never>;
    }): Promise<{ userId: string; publicKey: string }> => {
      const existing = this.users.get(where.publicKey);
      const user = existing ?? {
        userId: `user-${this.users.size + 1}`,
        publicKey: create.publicKey,
      };
      this.users.set(where.publicKey, user);
      return Promise.resolve(user);
    },
  };
}

describe('Auth challenge-response flow (e2e)', () => {
  let app: INestApplication<App>;
  let fakePrisma: FakePrismaService;
  let rateLimitGuard: AuthRateLimitGuard;

  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();

  const signChallenge = (challenge: string, signer: Keypair = keypair) =>
    signer.sign(Buffer.from(challenge, 'utf8')).toString('base64');

  const requestChallenge = async (key: string = publicKey) => {
    const response = await request(app.getHttpServer())
      .post('/auth/challenge')
      .send({ publicKey: key })
      .expect(201);
    return response.body as { challenge: string; expiresAt: string };
  };

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
      }),
    );
    await app.init();

    rateLimitGuard = moduleFixture.get(AuthRateLimitGuard);
  });

  beforeEach(() => {
    // Keep the shared rate-limit window from tripping across unrelated tests.
    rateLimitGuard.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/challenge', () => {
    it('issues a challenge with an expiry for a valid public key', async () => {
      const body = await requestChallenge();

      expect(body.challenge).toMatch(/^[0-9a-f]{64}$/);
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('invalidates the previous challenge when a new one is requested', async () => {
      const first = await requestChallenge();
      const second = await requestChallenge();

      expect(second.challenge).not.toBe(first.challenge);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          publicKey,
          challenge: first.challenge,
          signature: signChallenge(first.challenge),
        })
        .expect(401);
    });

    it('rejects an invalid Stellar public key', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ publicKey: 'not-a-valid-key' })
        .expect(400);

      expect(response.body).toMatchObject({ error: 'INVALID_WALLET' });
    });

    it('rejects a missing public key', async () => {
      await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({})
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('completes the full challenge → sign → login flow and rejects replay', async () => {
      const { challenge } = await requestChallenge();

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          publicKey,
          challenge,
          signature: signChallenge(challenge),
        })
        .expect(201);

      const body = login.body as { access_token: string };
      expect(typeof body.access_token).toBe('string');
      expect(body.access_token.split('.')).toHaveLength(3);

      // Replaying the same challenge and signature must fail.
      const replay = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          publicKey,
          challenge,
          signature: signChallenge(challenge),
        })
        .expect(401);

      expect(replay.body).toMatchObject({ error: 'INVALID_CHALLENGE' });
    });

    it('rejects a signature from a different wallet', async () => {
      const { challenge } = await requestChallenge();

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          publicKey,
          challenge,
          signature: signChallenge(challenge, Keypair.random()),
        })
        .expect(401);

      expect(response.body).toMatchObject({ error: 'INVALID_SIGNATURE' });
    });

    it('rejects a malformed Base64 signature', async () => {
      const { challenge } = await requestChallenge();

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ publicKey, challenge, signature: '@@@@' })
        .expect(401);

      expect(response.body).toMatchObject({ error: 'INVALID_SIGNATURE' });
    });

    it('rejects an expired challenge', async () => {
      const { challenge } = await requestChallenge();

      // Backdate the stored expiry to simulate the passage of time.
      const record = fakePrisma.store.get(publicKey);
      record!.expiresAt = new Date(Date.now() - 1_000);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          publicKey,
          challenge,
          signature: signChallenge(challenge),
        })
        .expect(401);

      expect(response.body).toMatchObject({ error: 'INVALID_CHALLENGE' });
    });

    it('rejects a login with no stored challenge', async () => {
      const stranger = Keypair.random();
      const challenge = 'c'.repeat(64);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          publicKey: stranger.publicKey(),
          challenge,
          signature: signChallenge(challenge, stranger),
        })
        .expect(401);
    });

    it('rejects requests with missing fields', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ publicKey })
        .expect(400);
    });
  });

  describe('rate limiting', () => {
    it('returns 429 after too many attempts even when the public key rotates', async () => {
      for (let i = 0; i < AuthRateLimitGuard.MAX_ATTEMPTS; i++) {
        await request(app.getHttpServer())
          .post('/auth/challenge')
          .send({ publicKey: Keypair.random().publicKey() })
          .expect(201);
      }

      const response = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ publicKey: Keypair.random().publicKey() })
        .expect(429);

      expect(response.body).toMatchObject({ error: 'TOO_MANY_REQUESTS' });
    });

    it('throttles /auth/challenge and /auth/login independently', async () => {
      for (let i = 0; i < AuthRateLimitGuard.MAX_ATTEMPTS; i++) {
        await request(app.getHttpServer())
          .post('/auth/challenge')
          .send({ publicKey })
          .expect(201);
      }

      // The challenge bucket is exhausted, yet login still reaches the
      // service (and fails authentication, not rate limiting).
      const other = 'd'.repeat(64);
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ publicKey, challenge: other, signature: signChallenge(other) })
        .expect(401);

      expect(response.body).toMatchObject({ error: 'INVALID_CHALLENGE' });
    });
  });
});
