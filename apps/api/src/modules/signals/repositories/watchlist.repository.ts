import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class WatchlistRepository implements OnModuleInit {
  private readonly logger = new Logger(WatchlistRepository.name);
  private redis: Redis | null = null;
  private redisEnabled = false;
  private redisReady = false;
  private readonly WATCHLIST_KEY = 'signals:watchlist';
  private readonly WATCHLIST_INIT_KEY = 'signals:watchlist:initialized';
  private readonly defaultWatchlist = [
    'AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META', 'AMZN', 'AMD', 'NFLX', 'DIS',
  ];

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = this.configService.get<{
      enabled?: boolean;
      host: string;
      port: number;
      password?: string;
    }>('redis');

    this.redisEnabled = Boolean(redisConfig?.enabled);
    if (!this.redisEnabled) {
      this.logger.warn('Redis disabled - watchlist cache will use PostgreSQL only');
      return;
    }

    this.redis = new Redis({
      host: redisConfig?.host || 'localhost',
      port: redisConfig?.port ?? 6379,
      password: redisConfig?.password,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      retryStrategy: (times) => Math.min(times * 1000, 30000),
    });

    this.redis.on('ready', () => {
      this.redisReady = true;
      this.logger.log('Connected to Redis for watchlist storage');
      void this.ensureDefaults();
    });

    this.redis.on('end', () => {
      this.redisReady = false;
      this.logger.warn('Redis connection closed for watchlist storage');
    });

    this.redis.on('error', (err) => {
      this.redisReady = false;
      this.logger.warn(`Redis connection error: ${err.message}`);
    });

    await this.ensureDefaults();
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

  async getWatchlist(): Promise<string[]> {
    if (!this.isAvailable()) {
      return [...this.defaultWatchlist];
    }

    const list = await this.withRedis(
      () => this.redis!.lrange(this.WATCHLIST_KEY, 0, -1),
      [],
    );
    if (list.length === 0) {
      const initialized = await this.withRedis(
        () => this.redis!.get(this.WATCHLIST_INIT_KEY),
        null,
      );
      if (!initialized) {
        await this.ensureDefaults();
        return [...this.defaultWatchlist];
      }
    }
    return list;
  }

  async addSymbol(symbol: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    const normalized = symbol.toUpperCase();
    const list = await this.withRedis(
      () => this.redis!.lrange(this.WATCHLIST_KEY, 0, -1),
      [],
    );
    if (list.includes(normalized)) {
      return false;
    }
    await this.withRedis(() => this.redis!.lpush(this.WATCHLIST_KEY, normalized), null);
    return true;
  }

  async removeSymbol(symbol: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    const normalized = symbol.toUpperCase();
    const removed = await this.withRedis(
      () => this.redis!.lrem(this.WATCHLIST_KEY, 0, normalized),
      0,
    );
    return removed > 0;
  }

  async moveSymbol(sourceSymbol: string, targetSymbol: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    const normalizedSource = sourceSymbol.toUpperCase();
    const normalizedTarget = targetSymbol.toUpperCase();
    const list = await this.withRedis(
      () => this.redis!.lrange(this.WATCHLIST_KEY, 0, -1),
      [],
    );
    const sourceIndex = list.indexOf(normalizedSource);
    const targetIndex = list.indexOf(normalizedTarget);

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return false;
    }

    const next = [...list];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);

    await this.replaceWatchlist(next);
    return true;
  }

  private async ensureDefaults(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const initialized = await this.withRedis(
      () => this.redis!.get(this.WATCHLIST_INIT_KEY),
      null,
    );
    if (initialized) {
      return;
    }

    const length = await this.withRedis(
      () => this.redis!.llen(this.WATCHLIST_KEY),
      0,
    );
    if (length === 0) {
      await this.withRedis(
        () => this.redis!.rpush(this.WATCHLIST_KEY, ...this.defaultWatchlist),
        null,
      );
    }

    await this.withRedis(() => this.redis!.set(this.WATCHLIST_INIT_KEY, '1'), null);
  }

  private async replaceWatchlist(symbols: string[]): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const normalized = Array.from(
      new Set(symbols.map((symbol) => symbol.toUpperCase())),
    ).filter(Boolean);

    const pipeline = this.redis!.multi();
    pipeline.del(this.WATCHLIST_KEY);
    if (normalized.length > 0) {
      pipeline.rpush(this.WATCHLIST_KEY, ...normalized);
    }
    await this.withRedis(() => pipeline.exec(), null);
  }
}
