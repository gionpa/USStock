import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { EventEmitter } from 'events';
import * as WebSocket from 'ws';
import { StockQuote, MarketSession } from '@/common/interfaces';

interface PolygonQuoteResponse {
  ticker: string;
  c: number; // close
  h: number; // high
  l: number; // low
  o: number; // open
  pc: number; // previous close
  t: number; // timestamp
}

interface PolygonTradeMessage {
  ev: string; // event type: 'T' for trade, 'XT' for extended hours trade
  sym: string;
  p: number; // price
  s: number; // size
  t: number; // timestamp
}

interface PolygonExtendedTradeMessage {
  ev: string; // event type: 'XT' for extended hours trade
  sym: string;
  p: number; // price
  s: number; // size
  t: number; // timestamp
}

interface PolygonQuoteMessage {
  ev: string; // event type: 'Q' for quote
  sym: string;
  bp: number; // bid price
  bs: number; // bid size
  ap: number; // ask price
  as: number; // ask size
  t: number; // timestamp
}

@Injectable()
export class PolygonQuotesService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PolygonQuotesService.name);
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private readonly apiKey: string;
  private readonly wsEnabled: boolean;
  private ws: WebSocket | null = null;
  private subscribedSymbols = new Set<string>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private rateLimitUntil: number | null = null;
  private rateLimitBackoffMs = 60000;
  private reconnectBlocked = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    super();
    this.baseUrl = this.configService.get<string>('polygon.baseUrl')!;
    this.wsUrl = this.configService.get<string>('polygon.wsUrl')!;
    this.apiKey = this.configService.get<string>('polygon.apiKey')!;
    this.wsEnabled = this.configService.get<boolean>('polygon.wsEnabled') ?? true;
  }

  onModuleInit() {
    if (this.apiKey && this.wsEnabled) {
      this.connectWebSocket();
    } else {
      this.logger.warn('Polygon WebSocket disabled (missing key or disabled flag)');
    }
  }

  onModuleDestroy() {
    this.disconnectWebSocket();
  }

  private connectWebSocket() {
    if (!this.apiKey || !this.wsEnabled || this.reconnectBlocked) {
      return;
    }

    try {
      this.ws = new WebSocket(`${this.wsUrl}/stocks`);

      this.ws.on('open', () => {
        this.logger.log('Connected to Polygon WebSocket');
        this.reconnectAttempts = 0;
        this.rateLimitUntil = null;
        this.rateLimitBackoffMs = 60000;
        this.authenticate();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(JSON.parse(data.toString()));
      });

      this.ws.on('close', () => {
        this.logger.warn('Polygon WebSocket connection closed');
        if (this.reconnectBlocked) {
          return;
        }
        this.attemptReconnect();
      });

      this.ws.on('error', (error) => {
        if (this.isRateLimitError(error)) {
          this.handleRateLimit();
          this.disconnectWebSocket();
          return;
        }
        this.logger.error('Polygon WebSocket error:', error);
      });
    } catch (error) {
      this.logger.error('Failed to connect to Polygon WebSocket', error);
    }
  }

  private authenticate() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'auth', params: this.apiKey }));
    }
  }

  private handleMessage(messages: any[]) {
    if (!Array.isArray(messages)) {
      messages = [messages];
    }

    for (const msg of messages) {
      switch (msg.ev) {
        case 'status':
          if (msg.status === 'auth_success') {
            this.logger.log('Polygon WebSocket authenticated');
            this.resubscribeSymbols();
          } else if (msg.status === 'auth_failed') {
            this.logger.error('Polygon WebSocket authentication failed');
            this.reconnectBlocked = true;
            this.disconnectWebSocket();
          }
          break;
        case 'T': // Trade
          this.handleTrade(msg as PolygonTradeMessage, false);
          break;
        case 'XT': // Extended Hours Trade
          this.handleTrade(msg as PolygonExtendedTradeMessage, true);
          break;
        case 'Q': // Quote
          this.handleQuote(msg as PolygonQuoteMessage);
          break;
      }
    }
  }

  private handleTrade(trade: PolygonTradeMessage, isExtendedHours: boolean) {
    this.emit('trade', {
      symbol: trade.sym,
      price: trade.p,
      size: trade.s,
      timestamp: new Date(trade.t),
      isExtendedHours,
    });
  }

  private handleQuote(quote: PolygonQuoteMessage) {
    this.emit('quote', {
      symbol: quote.sym,
      bidPrice: quote.bp,
      bidSize: quote.bs,
      askPrice: quote.ap,
      askSize: quote.as,
      timestamp: new Date(quote.t),
    });
  }

  private attemptReconnect() {
    if (!this.apiKey || !this.wsEnabled || this.reconnectBlocked) {
      return;
    }

    if (this.rateLimitUntil && Date.now() < this.rateLimitUntil) {
      const delay = this.rateLimitUntil - Date.now();
      this.logger.warn(`Rate limited - reconnecting in ${delay}ms...`);
      setTimeout(() => this.connectWebSocket(), delay);
      return;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.logger.log(`Attempting to reconnect in ${delay}ms...`);
      setTimeout(() => this.connectWebSocket(), delay);
    } else {
      this.logger.error('Max reconnection attempts reached');
    }
  }

  private disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleRateLimit() {
    const backoff = this.rateLimitBackoffMs;
    this.rateLimitBackoffMs = Math.min(this.rateLimitBackoffMs * 2, 10 * 60 * 1000);
    this.rateLimitUntil = Date.now() + backoff;
    this.reconnectAttempts = 0;
    this.logger.warn(`Polygon rate limit hit - backing off for ${backoff}ms`);
  }

  private isRateLimitError(error: unknown): boolean {
    if (!error) {
      return false;
    }

    const message =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : String(error);

    return message.includes('429');
  }

  private resubscribeSymbols() {
    if (this.subscribedSymbols.size > 0) {
      const symbols = Array.from(this.subscribedSymbols);
      this.subscribe(symbols);
    }
  }

  subscribe(symbols: string[]) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Subscribe to regular trades (T), quotes (Q), and extended hours trades (XT)
      const params = symbols.map((s) => `T.${s},Q.${s},XT.${s}`).join(',');
      this.ws.send(JSON.stringify({ action: 'subscribe', params }));
      symbols.forEach((s) => this.subscribedSymbols.add(s));
      this.logger.log(`Subscribed to (including extended hours): ${symbols.join(', ')}`);
    }
  }

  unsubscribe(symbols: string[]) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Unsubscribe from regular trades (T), quotes (Q), and extended hours trades (XT)
      const params = symbols.map((s) => `T.${s},Q.${s},XT.${s}`).join(',');
      this.ws.send(JSON.stringify({ action: 'unsubscribe', params }));
      symbols.forEach((s) => this.subscribedSymbols.delete(s));
      this.logger.log(`Unsubscribed from: ${symbols.join(', ')}`);
    }
  }

  async getQuote(symbol: string): Promise<StockQuote | null> {
    try {
      const url = `${this.baseUrl}/v2/aggs/ticker/${symbol}/prev`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: { apiKey: this.apiKey },
        }),
      );

      const result = response.data.results?.[0];
      if (!result) return null;

      return {
        symbol,
        price: result.c,
        change: result.c - result.o,
        changePercent: ((result.c - result.o) / result.o) * 100,
        volume: result.v,
        timestamp: new Date(result.t),
        open: result.o,
        high: result.h,
        low: result.l,
        previousClose: result.c,
      };
    } catch (error) {
      this.logger.error(`Failed to get quote for ${symbol} from Polygon`, error);
      return null;
    }
  }

  async getSnapshot(symbol: string): Promise<StockQuote | null> {
    try {
      const url = `${this.baseUrl}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: { apiKey: this.apiKey },
        }),
      );

      const ticker = response.data.ticker;
      if (!ticker) return null;

      const day = ticker.day || {};
      const prevDay = ticker.prevDay || {};
      const preMarketData = ticker.preMarket || null;
      const afterHoursData = ticker.afterHours || null;

      // Determine current market session
      const marketSession = this.getCurrentMarketSession();

      // Get the most recent price based on market session
      let currentPrice = day.c || 0;
      if (marketSession === 'pre-market' && preMarketData?.last) {
        currentPrice = preMarketData.last;
      } else if (marketSession === 'after-hours' && afterHoursData?.last) {
        currentPrice = afterHoursData.last;
      } else if (ticker.lastTrade?.p) {
        currentPrice = ticker.lastTrade.p;
      }

      const quote: StockQuote = {
        symbol,
        price: currentPrice,
        change: currentPrice - (prevDay.c || 0),
        changePercent: prevDay.c ? ((currentPrice - prevDay.c) / prevDay.c) * 100 : 0,
        volume: day.v || 0,
        timestamp: new Date(ticker.lastTrade?.t || Date.now()),
        open: day.o,
        high: day.h,
        low: day.l,
        previousClose: prevDay.c,
        marketSession,
      };

      // Add pre-market data if available
      if (preMarketData?.last) {
        quote.preMarket = {
          price: preMarketData.last,
          change: preMarketData.last - (prevDay.c || 0),
          changePercent: prevDay.c ? ((preMarketData.last - prevDay.c) / prevDay.c) * 100 : 0,
          timestamp: new Date(preMarketData.timestamp || Date.now()),
        };
      }

      // Add after-hours data if available
      if (afterHoursData?.last) {
        quote.afterHours = {
          price: afterHoursData.last,
          change: afterHoursData.last - (day.c || prevDay.c || 0),
          changePercent: (day.c || prevDay.c) ? ((afterHoursData.last - (day.c || prevDay.c)) / (day.c || prevDay.c)) * 100 : 0,
          timestamp: new Date(afterHoursData.timestamp || Date.now()),
        };
      }

      return quote;
    } catch (error) {
      this.logger.error(`Failed to get snapshot for ${symbol} from Polygon`, error);
      return null;
    }
  }

  async getAggregates(
    symbol: string,
    range: string,
  ): Promise<{ timestamp: number; price: number }[] | null> {
    try {
      const { multiplier, timespan, from, to } = this.getAggregateParams(range);
      const url = `${this.baseUrl}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`;
      this.logger.debug(`Fetching aggregates from: ${url}`);
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            adjusted: true,
            sort: 'asc',
            apiKey: this.apiKey,
          },
        }),
      );

      const results = response.data.results;
      if (!results || !Array.isArray(results) || results.length === 0) {
        this.logger.warn(`No aggregates results for ${symbol} (${range})`);
        return null;
      }

      this.logger.log(`Got ${results.length} aggregates for ${symbol} from Polygon`);
      return results.map((bar: { t: number; c: number }) => ({
        timestamp: bar.t,
        price: bar.c,
      }));
    } catch (error) {
      this.logger.error(`Failed to get aggregates for ${symbol} from Polygon`, error);
      return null;
    }
  }

  private getAggregateParams(range: string): {
    multiplier: number;
    timespan: string;
    from: string;
    to: string;
  } {
    // Use US Eastern Time for Polygon API (market time)
    // All date operations use string-based manipulation to avoid timezone issues
    const now = new Date();

    const etDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const etTimeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    });

    // Get current ET date string (YYYY-MM-DD format from en-CA locale)
    const etDateStr = etDateFormatter.format(now);
    const etHour = parseInt(etTimeFormatter.format(now), 10);

    // Helper to parse YYYY-MM-DD and create UTC noon date (avoids DST issues)
    const parseToUTCNoon = (dateStr: string): Date => {
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    };

    // Helper to format Date to YYYY-MM-DD
    const formatDate = (date: Date): string => {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Start with current ET date as UTC noon
    let toDate = parseToUTCNoon(etDateStr);

    // If before market open (10 AM ET), use previous trading day for 'to'
    // This ensures we get complete data from the last trading session
    if (etHour < 10) {
      toDate.setUTCDate(toDate.getUTCDate() - 1);
    }

    // Skip weekends for 'to' date (use UTC methods since we created UTC noon date)
    const toDay = toDate.getUTCDay();
    if (toDay === 0) {
      // Sunday -> Friday
      toDate.setUTCDate(toDate.getUTCDate() - 2);
    } else if (toDay === 6) {
      // Saturday -> Friday
      toDate.setUTCDate(toDate.getUTCDate() - 1);
    }

    const to = formatDate(toDate);
    const normalized = range.toLowerCase();

    const getFromDate = (daysAgo: number): string => {
      const date = new Date(toDate.getTime());
      date.setUTCDate(date.getUTCDate() - daysAgo);
      return formatDate(date);
    };

    switch (normalized) {
      case '1w':
        // Use daily data for 1 week - more reliable than hourly
        return { multiplier: 1, timespan: 'day', from: getFromDate(10), to };
      case '1m':
        return { multiplier: 1, timespan: 'day', from: getFromDate(35), to };
      case '3m':
        return { multiplier: 1, timespan: 'day', from: getFromDate(100), to };
      case '1y':
        return { multiplier: 1, timespan: 'day', from: getFromDate(380), to };
      case 'max':
        return { multiplier: 1, timespan: 'week', from: getFromDate(365 * 5), to };
      default:
        return { multiplier: 1, timespan: 'day', from: getFromDate(35), to };
    }
  }

  private getCurrentMarketSession(): MarketSession {
    const now = new Date();
    const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hours = etNow.getHours();
    const minutes = etNow.getMinutes();
    const day = etNow.getDay();
    const currentTime = hours * 60 + minutes;

    // Weekend check
    if (day === 0 || day === 6) {
      return 'closed';
    }

    // Pre-market: 4:00 AM - 9:30 AM ET
    if (currentTime >= 4 * 60 && currentTime < 9 * 60 + 30) {
      return 'pre-market';
    }

    // Regular hours: 9:30 AM - 4:00 PM ET
    if (currentTime >= 9 * 60 + 30 && currentTime < 16 * 60) {
      return 'regular';
    }

    // After-hours: 4:00 PM - 8:00 PM ET
    if (currentTime >= 16 * 60 && currentTime < 20 * 60) {
      return 'after-hours';
    }

    return 'closed';
  }
}
