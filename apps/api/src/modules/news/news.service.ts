import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PolygonNewsService } from './providers/polygon-news.service';
import { FinnhubNewsService } from './providers/finnhub-news.service';
import { NewsRepository } from './repositories/news.repository';
import { NewsPgRepository } from './repositories/news-pg.repository';
import { StockNews, NewsSentiment } from '@/common/interfaces';

interface StoredNews extends StockNews {
  titleKo?: string;
  summaryKo?: string | null;
}

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private readonly polygonNews: PolygonNewsService,
    private readonly finnhubNews: FinnhubNewsService,
    private readonly newsRepository: NewsRepository,
    private readonly newsPgRepository: NewsPgRepository,
    @InjectQueue('news-processing') private readonly newsQueue: Queue,
  ) {}

  /**
   * Get market news - returns from Redis if available, fetches and stores if not
   */
  async getMarketNews(): Promise<StoredNews[]> {
    // Try to get from Redis first
    const cachedNews = await this.newsRepository.getMarketNews(50);

    if (cachedNews.length > 0) {
      this.logger.debug(`Returning ${cachedNews.length} news from Redis`);
      return cachedNews;
    }

    // If no cached news, fetch fresh and store
    this.logger.log('No cached news, fetching fresh...');
    await this.fetchAndStoreMarketNews();

    return this.newsRepository.getMarketNews(50);
  }

  /**
   * Get news for specific symbol
   */
  async getNewsForSymbol(symbol: string): Promise<StoredNews[]> {
    // Try to get from Redis first
    const cachedNews = await this.newsRepository.getNewsBySymbol(symbol, 30);

    if (cachedNews.length > 0) {
      this.logger.debug(`Returning ${cachedNews.length} news for ${symbol} from Redis`);
      return cachedNews;
    }

    // If no cached news for symbol, fetch fresh
    this.logger.log(`No cached news for ${symbol}, fetching...`);
    await this.fetchAndStoreSymbolNews(symbol);

    return this.newsRepository.getNewsBySymbol(symbol, 30);
  }

  /**
   * Get sentiment for symbol
   */
  async getSentimentForSymbol(symbol: string): Promise<NewsSentiment | null> {
    return this.finnhubNews.getNewsSentiment(symbol);
  }

  /**
   * Fetch market news from providers and store in Redis and PostgreSQL
   */
  async fetchAndStoreMarketNews(): Promise<{ saved: number; duplicates: number }> {
    this.logger.log('Fetching market news from providers...');

    const [polygonNews, finnhubNews] = await Promise.all([
      this.polygonNews.getMarketNews(50),
      this.finnhubNews.getMarketNews(),
    ]);

    const allNews = this.deduplicateNews([...polygonNews, ...finnhubNews]);
    this.logger.log(`Fetched ${allNews.length} unique news items`);

    // Save to Redis (cache) and PostgreSQL (persistent)
    const [redisResult, pgResult] = await Promise.all([
      this.newsRepository.saveNewsBatch(allNews),
      this.newsPgRepository.saveNewsBatch(allNews),
    ]);

    this.logger.log(`Saved to PostgreSQL: ${pgResult.saved} new, ${pgResult.duplicates} duplicates`);

    // Queue untranslated news for translation
    if (redisResult.saved > 0) {
      await this.newsQueue.add('translate-batch', {}, { delay: 1000 });
    }

    return redisResult;
  }

  /**
   * Fetch news for specific symbol and store in Redis and PostgreSQL
   */
  async fetchAndStoreSymbolNews(symbol: string): Promise<{ saved: number; duplicates: number }> {
    this.logger.log(`Fetching news for ${symbol}...`);

    const [polygonNews, finnhubNews] = await Promise.all([
      this.polygonNews.getTickerNews(symbol, 20),
      this.finnhubNews.getCompanyNews(symbol),
    ]);

    const allNews = this.deduplicateNews([...polygonNews, ...finnhubNews]);

    // Save to Redis (cache) and PostgreSQL (persistent)
    const [redisResult, pgResult] = await Promise.all([
      this.newsRepository.saveNewsBatch(allNews),
      this.newsPgRepository.saveNewsBatch(allNews),
    ]);

    this.logger.log(`Saved ${symbol} news to PostgreSQL: ${pgResult.saved} new, ${pgResult.duplicates} duplicates`);

    return redisResult;
  }

  /**
   * Deduplicate news by normalized title
   */
  private deduplicateNews(newsItems: StockNews[]): StockNews[] {
    const seen = new Set<string>();
    const deduplicated: StockNews[] = [];

    // Sort by published date (newest first)
    const sorted = newsItems.sort(
      (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
    );

    for (const item of sorted) {
      const normalizedTitle = item.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 50);

      if (!seen.has(normalizedTitle)) {
        seen.add(normalizedTitle);
        deduplicated.push(item);
      }
    }

    return deduplicated;
  }

  /**
   * Scheduled job: Fetch and store market news every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledNewsFetch() {
    this.logger.log('Running scheduled news fetch...');

    try {
      const result = await this.fetchAndStoreMarketNews();
      this.logger.log(`Scheduled fetch complete: ${result.saved} new, ${result.duplicates} duplicates`);

      // Also fetch for popular symbols
      const popularSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META'];
      for (const symbol of popularSymbols) {
        await this.fetchAndStoreSymbolNews(symbol);
      }
    } catch (error: any) {
      this.logger.error('Scheduled news fetch failed:', error?.message);
    }
  }

  /**
   * Scheduled job: Clean up old news every day
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scheduledCleanup() {
    this.logger.log('Running scheduled news cleanup...');
    const removed = await this.newsRepository.cleanupOldNews();
    this.logger.log(`Cleanup complete: removed ${removed} old entries`);
  }

  /**
   * Get untranslated news for translation job
   */
  async getUntranslatedNews(limit: number = 20): Promise<StoredNews[]> {
    return this.newsRepository.getUntranslatedNews(limit);
  }

  /**
   * Get news stats
   */
  async getStats(): Promise<{ totalNews: number }> {
    const totalNews = await this.newsRepository.getNewsCount();
    return { totalNews };
  }

  /**
   * Manually trigger translation for untranslated news
   */
  async triggerTranslation(): Promise<{ queued: number }> {
    const untranslated = await this.newsRepository.getUntranslatedNews(20);

    if (untranslated.length === 0) {
      this.logger.log('No untranslated news to queue');
      return { queued: 0 };
    }

    this.logger.log(`Queueing ${untranslated.length} news items for translation`);
    await this.newsQueue.add('translate-batch', {}, { delay: 500 });

    return { queued: untranslated.length };
  }
}
