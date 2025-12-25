import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 8080);

  const corsOrigin = configService.get<string>('corsOrigin', 'http://localhost:3200');
  const originList = corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowAnyOrigin = corsOrigin === '*';

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowAnyOrigin) {
        return callback(null, true);
      }
      return callback(null, originList.includes(origin));
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  await app.listen(port);
  console.log(`🚀 USStock API is running on: http://localhost:${port}`);
}

bootstrap();
