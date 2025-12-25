import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import Redis from 'ioredis';

import { PrismaModule } from './prisma/prisma.module';
import { NewsModule } from './modules/news/news.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { SignalsModule } from './modules/signals/signals.module';
import { FinancialsModule } from './modules/financials/financials.module';
import { HealthController } from './health.controller';

import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get<{
          enabled?: boolean;
          host: string;
          port: number;
          password?: string;
        }>('redis');
        const logger = new Logger('BullModule');
        if (!redisConfig?.enabled) {
          logger.warn('Redis disabled - Bull queues will not run');
        }
        const redisOptions = {
          host: redisConfig?.host || 'localhost',
          port: redisConfig?.port ?? 6379,
          password: redisConfig?.password,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: true,
          enableOfflineQueue: false,
          connectTimeout: 5000,
          retryStrategy: (times: number) => Math.min(times * 1000, 30000),
        };
        return {
          redis: redisOptions,
          createClient: () => {
            const client = new Redis(redisOptions);
            client.on('error', (err) => {
              logger.warn(`Bull Redis client error: ${err.message}`);
            });
            return client;
          },
        };
      },
    }),
    PrismaModule,
    NewsModule,
    QuotesModule,
    AnalysisModule,
    SignalsModule,
    FinancialsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
