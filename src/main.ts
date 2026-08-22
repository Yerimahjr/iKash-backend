import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/errors';
import 'dotenv/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'https://ikash-frontend-dev-977686155876.us-central1.run.app',
      'https://ikash.it.com',
    ],
    credentials: true,
  });

  // Configure proxy trust for rate-limiting client IP extraction
  const trustProxy = process.env.TRUST_PROXY || '1';
  app
    .getHttpAdapter()
    .getInstance()
    .set(
      'trust proxy',
      isNaN(Number(trustProxy)) ? trustProxy : Number(trustProxy),
    );

  // 👇 CORRECCIÓN AQUÍ: Agrega '0.0.0.0' como segundo parámetro
  const port = process.env.PORT ?? 3001;
  await app.listen(port, '0.0.0.0');

  console.log(`Application is running on port ${port}`);
}
void bootstrap();
