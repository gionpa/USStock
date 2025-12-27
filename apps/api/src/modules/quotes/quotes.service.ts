import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PolygonQuotesService } from './providers/polygon-quotes.service';
import { FinnhubQuotesService } from './providers/finnhub-quotes.service';
import { StockQuote, StockPriceHistoryPoint } from '@/common/interfaces';

export interface QuoteUpdate {
  symbol: string;
  price: number;
  volume?: number;
  timestamp: Date;
  source: 'polygon' | 'finnhub';
  isExtendedHours?: boolean;
}

export interface OrderBookUpdate {
  symbol: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  timestamp: Date;
}

@Injectable()
export class QuotesService implements OnModuleInit {
  private readonly logger = new Logger(QuotesService.name);
  private readonly quoteCache = new Map<string, StockQuote>();
  private readonly subscribers = new Map<string, Set<(data: QuoteUpdate) => void>>();
  private readonly orderBookSubscribers = new Map<string, Set<(data: OrderBookUpdate) => void>>();

  constructor(
    private readonly polygonQuotes: PolygonQuotesService,
    private readonly finnhubQuotes: FinnhubQuotesService,
  ) {}

  onModuleInit() {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen to Polygon trades (including extended hours)
    this.polygonQuotes.on('trade', (trade) => {
      this.handleTradeUpdate({
        symbol: trade.symbol,
        price: trade.price,
        volume: trade.size,
        timestamp: trade.timestamp,
        source: 'polygon',
        isExtendedHours: trade.isExtendedHours || false,
      });
    });

    // Listen to Polygon quotes (order book)
    this.polygonQuotes.on('quote', (quote) => {
      this.handleOrderBookUpdate({
        symbol: quote.symbol,
        bidPrice: quote.bidPrice,
        bidSize: quote.bidSize,
        askPrice: quote.askPrice,
        askSize: quote.askSize,
        timestamp: quote.timestamp,
      });
    });

    // Listen to Finnhub trades
    this.finnhubQuotes.on('trade', (trade) => {
      this.handleTradeUpdate({
        symbol: trade.symbol,
        price: trade.price,
        volume: trade.volume,
        timestamp: trade.timestamp,
        source: 'finnhub',
      });
    });
  }

  private handleTradeUpdate(update: QuoteUpdate) {
    // Update cache
    const existing = this.quoteCache.get(update.symbol);
    if (existing) {
      existing.price = update.price;
      existing.timestamp = update.timestamp;
      if (update.volume) {
        existing.volume = (existing.volume || 0) + update.volume;
      }
    }

    // Notify subscribers
    const callbacks = this.subscribers.get(update.symbol);
    if (callbacks) {
      callbacks.forEach((cb) => cb(update));
    }
  }

  private handleOrderBookUpdate(update: OrderBookUpdate) {
    const callbacks = this.orderBookSubscribers.get(update.symbol);
    if (callbacks) {
      callbacks.forEach((cb) => cb(update));
    }
  }

  async getQuote(symbol: string): Promise<StockQuote | null> {
    // Check cache first
    const cached = this.quoteCache.get(symbol);
    if (cached && Date.now() - cached.timestamp.getTime() < 60000) {
      return cached;
    }

    // Try Polygon first, fallback to Finnhub
    let quote = await this.polygonQuotes.getSnapshot(symbol);
    if (!quote) {
      quote = await this.finnhubQuotes.getQuote(symbol);
    }

    if (quote) {
      this.quoteCache.set(symbol, quote);
    }

    return quote;
  }

  async getQuotes(symbols: string[]): Promise<Map<string, StockQuote | null>> {
    const results = new Map<string, StockQuote | null>();

    await Promise.all(
      symbols.map(async (symbol) => {
        const quote = await this.getQuote(symbol);
        results.set(symbol, quote);
      }),
    );

    return results;
  }

  async getHistory(
    symbol: string,
    range: string = '1m',
  ): Promise<StockPriceHistoryPoint[]> {
    // Try Polygon first (better data quality)
    const polygonData = await this.polygonQuotes.getAggregates(symbol, range);
    if (polygonData && polygonData.length > 0) {
      this.logger.debug(`Got ${polygonData.length} points from Polygon for ${symbol}`);
      return polygonData;
    }

    // Fallback to Finnhub candles
    const { resolution, from, to } = this.getHistoryRange(range);
    const candles = await this.finnhubQuotes.getCandles(
      symbol,
      resolution,
      from,
      to,
    );

    if (
      candles &&
      candles.s === 'ok' &&
      Array.isArray(candles.t) &&
      Array.isArray(candles.c)
    ) {
      const points: StockPriceHistoryPoint[] = [];
      for (let index = 0; index < candles.t.length; index += 1) {
        const timestamp = candles.t[index];
        const price = candles.c[index];
        if (typeof timestamp === 'number' && typeof price === 'number') {
          points.push({
            timestamp: timestamp * 1000,
            price,
          });
        }
      }
      return points;
    }

    // Return empty array instead of fake data
    this.logger.warn(`No history data available for ${symbol} (${range})`);
    return [];
  }

  private getHistoryRange(range: string): {
    resolution: string;
    from: number;
    to: number;
  } {
    const now = Math.floor(Date.now() / 1000);
    const normalized = range.toLowerCase();

    switch (normalized) {
      case '1w':
        return { resolution: '60', from: now - 7 * 86400, to: now };
      case '1m':
        return { resolution: 'D', from: now - 30 * 86400, to: now };
      case '3m':
        return { resolution: 'D', from: now - 90 * 86400, to: now };
      case '1y':
        return { resolution: 'D', from: now - 365 * 86400, to: now };
      case 'max':
        return { resolution: 'W', from: now - 365 * 5 * 86400, to: now };
      default:
        return { resolution: 'D', from: now - 30 * 86400, to: now };
    }
  }

  private buildFallbackHistory(
    symbol: string,
    range: string,
    basePrice: number,
  ): StockPriceHistoryPoint[] {
    const { from, to } = this.getHistoryRange(range);
    const points = this.getFallbackPointCount(range);
    const totalSeconds = Math.max(to - from, 1);
    const interval = Math.max(Math.floor(totalSeconds / Math.max(points - 1, 1)), 1);
    const seed = this.hashSymbol(symbol);
    const drift = ((seed % 11) - 5) / 200;

    const series: StockPriceHistoryPoint[] = [];
    for (let i = 0; i < points; i += 1) {
      const timestamp = (from + i * interval) * 1000;
      const noise = Math.sin(i * 0.7 + seed) * basePrice * 0.012;
      const trend = basePrice * (1 + drift * (i / Math.max(points - 1, 1)));
      const price = Math.max(1, trend + noise);
      series.push({ timestamp, price });
    }

    return series;
  }

  private getFallbackPointCount(range: string): number {
    switch (range.toLowerCase()) {
      case '1w':
        return 28;
      case '1m':
        return 30;
      case '3m':
        return 60;
      case '1y':
        return 52;
      case 'max':
        return 60;
      default:
        return 30;
    }
  }

  private hashSymbol(symbol: string): number {
    return symbol
      .toUpperCase()
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  }

  subscribe(
    symbol: string,
    callback: (data: QuoteUpdate) => void,
  ): () => void {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set());
      // Subscribe to data providers
      this.polygonQuotes.subscribe([symbol]);
      this.finnhubQuotes.subscribe([symbol]);
    }

    this.subscribers.get(symbol)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(symbol);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(symbol);
          this.polygonQuotes.unsubscribe([symbol]);
          this.finnhubQuotes.unsubscribe([symbol]);
        }
      }
    };
  }

  subscribeOrderBook(
    symbol: string,
    callback: (data: OrderBookUpdate) => void,
  ): () => void {
    if (!this.orderBookSubscribers.has(symbol)) {
      this.orderBookSubscribers.set(symbol, new Set());
    }

    this.orderBookSubscribers.get(symbol)!.add(callback);

    return () => {
      const callbacks = this.orderBookSubscribers.get(symbol);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.orderBookSubscribers.delete(symbol);
        }
      }
    };
  }

  getSubscribedSymbols(): string[] {
    return Array.from(this.subscribers.keys());
  }
}
