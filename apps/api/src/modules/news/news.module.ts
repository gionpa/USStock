import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { PolygonNewsService } from './providers/polygon-news.service';
import { FinnhubNewsService } from './providers/finnhub-news.service';
import { NewsProcessor } from './news.processor';
import { TranslationService } from './services/translation.service';
import { NewsRepository } from './repositories/news.repository';
import { NewsPgRepository } from './repositories/news-pg.repository';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue({
      name: 'news-processing',
    }),
  ],
  controllers: [NewsController],
  providers: [
    NewsRepository,
    NewsPgRepository,
    NewsService,
    PolygonNewsService,
    FinnhubNewsService,
    NewsProcessor,
    TranslationService,
  ],
  exports: [NewsService, TranslationService, NewsRepository, NewsPgRepository],
})
export class NewsModule {}
