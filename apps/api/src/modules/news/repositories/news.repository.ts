import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { StockNews } from '@/common/interfaces';

interface StoredNews extends StockNews {
  titleKo?: string;
  summaryKo?: string | null;
  translatedAt?: string;
}

@Injectable()
export class NewsRepository implements OnModuleInit {
  private readonly logger = new Logger(NewsRepository.name);
  private redis: Redis | null = null;
  private redisEnabled = false;
  private redisReady = false;

  // Redis key prefixes
  private readonly NEWS_KEY = 'news:'; // news:{id} -> news item
  private readonly MARKET_NEWS_KEY = 'news:market:list'; // sorted set by publishedAt
  private readonly SYMBOL_NEWS_KEY = 'news:symbol:'; // news:symbol:{symbol} -> sorted set
  private readonly NEWS_HASH_KEY = 'news:hash:'; // news:hash:{normalizedTitle} -> id (for dedup)

  // TTL: 7 days for news
  private readonly NEWS_TTL = 7 * 24 * 60 * 60;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = this.configService.get<{
      enabled?: boolean;
      host: string;
      port: number;
      password?: string;
      tls?: Record<string, unknown>;
    }>('redis');

    this.redisEnabled = Boolean(redisConfig?.enabled);
    if (!this.redisEnabled) {
      this.logger.warn('Redis disabled - news cache will use PostgreSQL only');
      return;
    }

    this.redis = new Redis({
      host: redisConfig?.host || 'localhost',
      port: redisConfig?.port ?? 6379,
      password: redisConfig?.password,
      tls: redisConfig?.tls,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      retryStrategy: (times) => Math.min(times * 1000, 30000),
    });

    this.redis.on('ready', () => {
      this.redisReady = true;
      this.logger.log('Connected to Redis for news storage');
    });

    this.redis.on('end', () => {
      this.redisReady = false;
      this.logger.warn('Redis connection closed for news storage');
    });

    this.redis.on('error', (err) => {
      this.redisReady = false;
      this.logger.warn(`Redis connection error: ${err.message}`);
    });
  }

  isAvailable(): boolean {
    return this.redisEnabled && this.redisReady && this.redis !== null;
  }

  private async withRedis<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    if (!this.isAvailable()) {
      return fallback;
    }

    try {
      return await operation();
    } catch (error: any) {
      this.redisReady = false;
      this.logger.warn(`Redis operation failed: ${error?.message || error}`);
      return fallback;
    }
  }

  /**
   * Check if news already exists (by normalized title)
   */
  async isDuplicate(title: string): Promise<boolean> {
    const normalizedTitle = this.normalizeTitle(title);
    return this.withRedis(async () => {
      const exists = await this.redis!.exists(`${this.NEWS_HASH_KEY}${normalizedTitle}`);
      return exists === 1;
    }, false);
  }

  /**
   * Save news item to Redis
   */
  async saveNews(news: StoredNews): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const normalizedTitle = this.normalizeTitle(news.title);

    // Check for duplicate
    const existingId = await this.withRedis(
      () => this.redis!.get(`${this.NEWS_HASH_KEY}${normalizedTitle}`),
      null,
    );
    if (existingId) {
      this.logger.debug(`News already exists: ${news.title.substring(0, 50)}...`);
      return;
    }

    const newsKey = `${this.NEWS_KEY}${news.id}`;
    const publishedTimestamp = news.publishedAt.getTime();

    // Store news data
    const newsData = {
      ...news,
      publishedAt: news.publishedAt.toISOString(),
      translatedAt: news.translatedAt || null,
    };

    const pipeline = this.redis!.pipeline();

    // Save news item as JSON
    pipeline.setex(newsKey, this.NEWS_TTL, JSON.stringify(newsData));

    // Add to market news sorted set
    pipeline.zadd(this.MARKET_NEWS_KEY, publishedTimestamp, news.id);

    // Add to symbol-specific sorted sets
    for (const symbol of news.symbols) {
      pipeline.zadd(`${this.SYMBOL_NEWS_KEY}${symbol}`, publishedTimestamp, news.id);
    }

    // Store hash for deduplication
    pipeline.setex(`${this.NEWS_HASH_KEY}${normalizedTitle}`, this.NEWS_TTL, news.id);

    await this.withRedis(() => pipeline.exec(), null);
    this.logger.debug(`Saved news: ${news.id} - ${news.title.substring(0, 50)}...`);
  }

  /**
   * Save batch of news items
   */
  async saveNewsBatch(newsItems: StoredNews[]): Promise<{ saved: number; duplicates: number }> {
    if (!this.isAvailable()) {
      return { saved: 0, duplicates: 0 };
    }

    let saved = 0;
    let duplicates = 0;

    for (const news of newsItems) {
      const normalizedTitle = this.normalizeTitle(news.title);
      const existingId = await this.withRedis(
        () => this.redis!.get(`${this.NEWS_HASH_KEY}${normalizedTitle}`),
        null,
      );

      if (existingId) {
        duplicates++;
        continue;
      }

      await this.saveNews(news);
      saved++;
    }

    this.logger.log(`Batch save: ${saved} new, ${duplicates} duplicates`);
    return { saved, duplicates };
  }

  /**
   * Update news with Korean translation
   */
  async updateTranslation(
    newsId: string,
    titleKo: string,
    summaryKo?: string | null,
  ): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const newsKey = `${this.NEWS_KEY}${newsId}`;
    const newsJson = await this.withRedis(() => this.redis!.get(newsKey), null);

    if (!newsJson) {
      this.logger.warn(`News not found for translation update: ${newsId}`);
      return;
    }

    const news: StoredNews = JSON.parse(newsJson);
    news.titleKo = titleKo;
    news.summaryKo = summaryKo;
    news.translatedAt = new Date().toISOString();

    // Get remaining TTL and save with same TTL
    const ttl = await this.withRedis(() => this.redis!.ttl(newsKey), -1);
    await this.withRedis(
      () => this.redis!.setex(newsKey, ttl > 0 ? ttl : this.NEWS_TTL, JSON.stringify(news)),
      null,
    );

    this.logger.debug(`Updated translation for: ${newsId}`);
  }

  /**
   * Get market news (sorted by publishedAt desc)
   */
  async getMarketNews(limit: number = 50): Promise<StoredNews[]> {
    // Get latest news IDs from sorted set (highest scores = newest)
    const newsIds = await this.withRedis(
      () => this.redis!.zrevrange(this.MARKET_NEWS_KEY, 0, limit - 1),
      [],
    );

    if (newsIds.length === 0) {
      return [];
    }

    return this.getNewsByIds(newsIds);
  }

  /**
   * Get news for specific symbol
   */
  async getNewsBySymbol(symbol: string, limit: number = 30): Promise<StoredNews[]> {
    const newsIds = await this.withRedis(
      () => this.redis!.zrevrange(
        `${this.SYMBOL_NEWS_KEY}${symbol.toUpperCase()}`,
        0,
        limit - 1
      ),
      [],
    );

    if (newsIds.length === 0) {
      return [];
    }

    return this.getNewsByIds(newsIds);
  }

  /**
   * Get news by IDs
   */
  private async getNewsByIds(newsIds: string[]): Promise<StoredNews[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const pipeline = this.redis!.pipeline();

    for (const id of newsIds) {
      pipeline.get(`${this.NEWS_KEY}${id}`);
    }

    const results = await this.withRedis(() => pipeline.exec(), null);
    const news: StoredNews[] = [];

    for (const [err, result] of results || []) {
      if (!err && result) {
        try {
          const parsed = JSON.parse(result as string);
          parsed.publishedAt = new Date(parsed.publishedAt);
          news.push(parsed);
        } catch (e) {
          this.logger.warn('Failed to parse news item');
        }
      }
    }

    return news;
  }

  /**
   * Get news items that need translation
   */
  async getUntranslatedNews(limit: number = 20): Promise<StoredNews[]> {
    const allNews = await this.getMarketNews(100);
    return allNews
      .filter((news) => {
        if (!news.titleKo) {
          return true;
        }
        if (news.summary) {
          if (news.summaryKo === null) {
            return false;
          }
          if (!news.summaryKo || news.summaryKo === news.summary) {
            return true;
          }
        }
        return false;
      })
      .slice(0, limit);
  }

  /**
   * Get news count
   */
  async getNewsCount(): Promise<number> {
    return this.withRedis(() => this.redis!.zcard(this.MARKET_NEWS_KEY), 0);
  }

  /**
   * Normalize title for deduplication
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 50);
  }

  /**
   * Clean up old news (called by scheduler)
   */
  async cleanupOldNews(): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    const cutoffTime = Date.now() - this.NEWS_TTL * 1000;

    // Remove old entries from sorted sets
    const removed = await this.withRedis(
      () => this.redis!.zremrangebyscore(
        this.MARKET_NEWS_KEY,
        '-inf',
        cutoffTime
      ),
      0,
    );

    this.logger.log(`Cleaned up ${removed} old news entries`);
    return removed;
  }
}
