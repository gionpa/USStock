import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { StockNews } from '@/common/interfaces';
import { TranslationService } from './services/translation.service';
import { NewsRepository } from './repositories/news.repository';
import { NewsPgRepository } from './repositories/news-pg.repository';

@Processor('news-processing')
export class NewsProcessor {
  private isTranslating = false;
  private readonly logger = new Logger(NewsProcessor.name);

  constructor(
    private readonly translationService: TranslationService,
    private readonly newsRepository: NewsRepository,
    private readonly newsPgRepository: NewsPgRepository,
  ) {}

  @Process('fetch-news')
  async handleFetchNews(job: Job<{ symbol: string }>) {
    const { symbol } = job.data;
    this.logger.log(`Fetching news for symbol: ${symbol}`);

    // This will be handled by the NewsService
    // The processor can emit events for real-time updates
    return { symbol, status: 'fetched' };
  }

  @Process('analyze-news')
  async handleAnalyzeNews(job: Job<{ news: StockNews; priority: number }>) {
    const { news, priority } = job.data;
    this.logger.log(
      `Analyzing news: "${news.title.substring(0, 50)}..." (priority: ${priority})`,
    );

    // In production, this would:
    // 1. Send to NLP/LLM for sentiment analysis
    // 2. Extract key entities and topics
    // 3. Store in vector DB for similarity search
    // 4. Trigger signal generation if significant

    return {
      newsId: news.id,
      status: 'analyzed',
      symbols: news.symbols,
    };
  }

  /**
   * Background job: Translate untranslated news items
   * Uses a lock to prevent concurrent translations
   */
  @Process('translate-batch')
  async handleTranslateBatch(job: Job) {
    // Prevent concurrent translation jobs
    if (this.isTranslating) {
      this.logger.log('Translation already in progress, skipping...');
      return { status: 'skipped', reason: 'already_translating' };
    }

    this.isTranslating = true;
    this.logger.log('Starting batch translation job...');

    try {
      // Get untranslated news from repository
      const untranslatedNews = this.newsRepository.isAvailable()
        ? await this.newsRepository.getUntranslatedNews(10)
        : await this.newsPgRepository.getUntranslatedNews(10);

      if (untranslatedNews.length === 0) {
        this.logger.log('No untranslated news found');
        this.isTranslating = false;
        return { status: 'no_work', translated: 0 };
      }

      this.logger.log(`Found ${untranslatedNews.length} news items to translate`);

      // Translate batch
      const result = await this.translationService.translateBatch(
        untranslatedNews.map((n) => ({
          id: n.id,
          title: n.title,
          summary: n.summary,
        })),
      );

      this.logger.log(
        `Batch translation job complete: ${result.success} success, ${result.failed} failed`,
      );

      this.isTranslating = false;
      return {
        status: 'completed',
        translated: result.success,
        failed: result.failed,
      };
    } catch (error: any) {
      this.isTranslating = false;
      this.logger.error(`Batch translation job failed: ${error?.message}`);
      throw error;
    }
  }

  /**
   * Translate a single news item
   */
  @Process('translate-single')
  async handleTranslateSingle(
    job: Job<{ newsId: string; title: string; summary?: string }>,
  ) {
    const { newsId, title, summary } = job.data;
    this.logger.log(`Translating single news: ${title.substring(0, 50)}...`);

    try {
      const result = await this.translationService.translateAndSave(
        newsId,
        title,
        summary,
      );

      if (result) {
        return { status: 'translated', newsId };
      } else {
        return { status: 'failed', newsId };
      }
    } catch (error: any) {
      this.logger.error(`Single translation failed: ${error?.message}`);
      throw error;
    }
  }
}
