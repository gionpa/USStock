import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { AnalysisProcessor } from './analysis.processor';
import { TechnicalIndicators } from './indicators/technical.indicators';
import { SentimentAnalyzer } from './strategies/sentiment.analyzer';
import { PriceActionAnalyzer } from './strategies/price-action.analyzer';
import { NewsModule } from '../news/news.module';
import { QuotesModule } from '../quotes/quotes.module';

@Module({
  imports: [
    NewsModule,
    QuotesModule,
    BullModule.registerQueue({
      name: 'analysis-processing',
    }),
  ],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    AnalysisProcessor,
    TechnicalIndicators,
    SentimentAnalyzer,
    PriceActionAnalyzer,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
