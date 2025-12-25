import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';

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
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6381', 10),
        password: process.env.REDIS_PASSWORD,
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
