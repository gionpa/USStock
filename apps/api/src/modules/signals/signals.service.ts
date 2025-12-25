import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TradingSignal } from '@/common/interfaces';
import { AnalysisService } from '../analysis/analysis.service';
import { WatchlistRepository } from './repositories/watchlist.repository';
import { WatchlistPgRepository } from './repositories/watchlist-pg.repository';

export interface SignalSummary {
  totalSignals: number;
  buySignals: number;
  sellSignals: number;
  holdSignals: number;
  strongBuySignals: TradingSignal[];
  strongSellSignals: TradingSignal[];
  updatedAt: Date;
}

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);
  private readonly signalHistory = new Map<string, TradingSignal[]>();
  private readonly activeSignals = new Map<string, TradingSignal>();

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly watchlistRepository: WatchlistRepository,
    private readonly watchlistPgRepository: WatchlistPgRepository,
  ) {}

  async getSignalForSymbol(symbol: string): Promise<TradingSignal | null> {
    // Check active signals first
    const active = this.activeSignals.get(symbol);
    if (active && active.expiresAt && active.expiresAt > new Date()) {
      return active;
    }

    // Generate new signal
    const analysis = await this.analysisService.analyzeSymbol(symbol);
    if (analysis.signal) {
      this.activeSignals.set(symbol, analysis.signal);
      this.addToHistory(symbol, analysis.signal);
    }

    return analysis.signal;
  }

  async getSignalsForWatchlist(): Promise<Map<string, TradingSignal | null>> {
    const signals = new Map<string, TradingSignal | null>();
    // Use PostgreSQL as primary source for watchlist
    const watchlist = await this.watchlistPgRepository.getWatchlist();

    await Promise.all(
      watchlist.map(async (symbol) => {
        try {
          const signal = await this.getSignalForSymbol(symbol);
          signals.set(symbol, signal);
        } catch (error) {
          this.logger.error(`Failed to get signal for ${symbol}`, error);
          signals.set(symbol, null);
        }
      }),
    );

    return signals;
  }

  getActiveSignals(): TradingSignal[] {
    const now = new Date();
    return Array.from(this.activeSignals.values()).filter(
      (signal) => !signal.expiresAt || signal.expiresAt > now,
    );
  }

  getSignalHistory(symbol: string, limit: number = 10): TradingSignal[] {
    const history = this.signalHistory.get(symbol) || [];
    return history.slice(-limit);
  }

  getSignalSummary(): SignalSummary {
    const activeSignals = this.getActiveSignals();

    const summary: SignalSummary = {
      totalSignals: activeSignals.length,
      buySignals: 0,
      sellSignals: 0,
      holdSignals: 0,
      strongBuySignals: [],
      strongSellSignals: [],
      updatedAt: new Date(),
    };

    for (const signal of activeSignals) {
      switch (signal.type) {
        case 'buy':
          summary.buySignals++;
          if (signal.strength >= 70) {
            summary.strongBuySignals.push(signal);
          }
          break;
        case 'sell':
          summary.sellSignals++;
          if (signal.strength >= 70) {
            summary.strongSellSignals.push(signal);
          }
          break;
        case 'hold':
          summary.holdSignals++;
          break;
      }
    }

    // Sort by strength
    summary.strongBuySignals.sort((a, b) => b.strength - a.strength);
    summary.strongSellSignals.sort((a, b) => b.strength - a.strength);

    return summary;
  }

  async addToWatchlist(symbol: string): Promise<boolean> {
    // Save to both Redis (cache) and PostgreSQL (persistent)
    const [redisResult, pgResult] = await Promise.all([
      this.watchlistRepository.addSymbol(symbol),
      this.watchlistPgRepository.addSymbol(symbol),
    ]);
    this.logger.log(`Added ${symbol} to watchlist: Redis=${redisResult}, PostgreSQL=${pgResult}`);
    return pgResult;
  }

  async removeFromWatchlist(symbol: string): Promise<boolean> {
    // Remove from both Redis and PostgreSQL
    const [redisResult, pgResult] = await Promise.all([
      this.watchlistRepository.removeSymbol(symbol),
      this.watchlistPgRepository.removeSymbol(symbol),
    ]);
    this.logger.log(`Removed ${symbol} from watchlist: Redis=${redisResult}, PostgreSQL=${pgResult}`);
    return pgResult;
  }

  async getWatchlist(): Promise<string[]> {
    // Use PostgreSQL as primary source
    return this.watchlistPgRepository.getWatchlist();
  }

  async reorderWatchlist(sourceSymbol: string, targetSymbol: string): Promise<boolean> {
    // Reorder in both Redis and PostgreSQL
    const [redisResult, pgResult] = await Promise.all([
      this.watchlistRepository.moveSymbol(sourceSymbol, targetSymbol),
      this.watchlistPgRepository.moveSymbol(sourceSymbol, targetSymbol),
    ]);
    return pgResult;
  }

  private addToHistory(symbol: string, signal: TradingSignal): void {
    if (!this.signalHistory.has(symbol)) {
      this.signalHistory.set(symbol, []);
    }

    const history = this.signalHistory.get(symbol)!;
    history.push(signal);

    // Keep only last 100 signals per symbol
    if (history.length > 100) {
      history.shift();
    }
  }

  // Scheduled task to refresh signals for watchlist
  @Cron(CronExpression.EVERY_10_MINUTES)
  async refreshWatchlistSignals(): Promise<void> {
    this.logger.log('Refreshing signals for watchlist...');

    // Use PostgreSQL as primary source
    const watchlist = await this.watchlistPgRepository.getWatchlist();
    for (const symbol of watchlist) {
      try {
        await this.getSignalForSymbol(symbol);
      } catch (error) {
        this.logger.error(`Failed to refresh signal for ${symbol}`, error);
      }
    }

    this.logger.log('Watchlist signals refreshed');
  }

  // Clean up expired signals
  @Cron(CronExpression.EVERY_HOUR)
  cleanupExpiredSignals(): void {
    const now = new Date();

    for (const [symbol, signal] of this.activeSignals) {
      if (signal.expiresAt && signal.expiresAt < now) {
        this.activeSignals.delete(symbol);
      }
    }

    this.logger.log('Expired signals cleaned up');
  }
}
