import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class WatchlistRepository implements OnModuleInit {
  private readonly logger = new Logger(WatchlistRepository.name);
  private redis!: Redis;
  private readonly WATCHLIST_KEY = 'signals:watchlist';
  private readonly WATCHLIST_INIT_KEY = 'signals:watchlist:initialized';
  private readonly defaultWatchlist = [
    'AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META', 'AMZN', 'AMD', 'NFLX', 'DIS',
  ];

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = this.configService.get<{
      host: string;
      port: number;
      password?: string;
    }>('redis');
    const redisHost = redisConfig?.host || this.configService.get('REDIS_HOST', 'localhost');
    const redisPort = redisConfig?.port
      ?? parseInt(this.configService.get('REDIS_PORT', '6381'), 10);
    const redisPassword = redisConfig?.password || this.configService.get('REDIS_PASSWORD');

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis for watchlist storage');
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error:', err.message);
    });

    await this.ensureDefaults();
  }

  async getWatchlist(): Promise<string[]> {
    const list = await this.redis.lrange(this.WATCHLIST_KEY, 0, -1);
    if (list.length === 0) {
      const initialized = await this.redis.get(this.WATCHLIST_INIT_KEY);
      if (!initialized) {
        await this.ensureDefaults();
        return [...this.defaultWatchlist];
      }
    }
    return list;
  }

  async addSymbol(symbol: string): Promise<boolean> {
    const normalized = symbol.toUpperCase();
    const list = await this.redis.lrange(this.WATCHLIST_KEY, 0, -1);
    if (list.includes(normalized)) {
      return false;
    }
    await this.redis.lpush(this.WATCHLIST_KEY, normalized);
    return true;
  }

  async removeSymbol(symbol: string): Promise<boolean> {
    const normalized = symbol.toUpperCase();
    const removed = await this.redis.lrem(this.WATCHLIST_KEY, 0, normalized);
    return removed > 0;
  }

  async moveSymbol(sourceSymbol: string, targetSymbol: string): Promise<boolean> {
    const normalizedSource = sourceSymbol.toUpperCase();
    const normalizedTarget = targetSymbol.toUpperCase();
    const list = await this.redis.lrange(this.WATCHLIST_KEY, 0, -1);
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
    const initialized = await this.redis.get(this.WATCHLIST_INIT_KEY);
    if (initialized) {
      return;
    }

    const length = await this.redis.llen(this.WATCHLIST_KEY);
    if (length === 0) {
      await this.redis.rpush(this.WATCHLIST_KEY, ...this.defaultWatchlist);
    }

    await this.redis.set(this.WATCHLIST_INIT_KEY, '1');
  }

  private async replaceWatchlist(symbols: string[]): Promise<void> {
    const normalized = Array.from(
      new Set(symbols.map((symbol) => symbol.toUpperCase())),
    ).filter(Boolean);

    const pipeline = this.redis.multi();
    pipeline.del(this.WATCHLIST_KEY);
    if (normalized.length > 0) {
      pipeline.rpush(this.WATCHLIST_KEY, ...normalized);
    }
    await pipeline.exec();
  }
}
