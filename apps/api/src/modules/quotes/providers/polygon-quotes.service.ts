import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { EventEmitter } from 'events';
import * as WebSocket from 'ws';
import { StockQuote, OrderBook } from '@/common/interfaces';

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
  ev: string; // event type: 'T' for trade
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
          this.handleTrade(msg as PolygonTradeMessage);
          break;
        case 'Q': // Quote
          this.handleQuote(msg as PolygonQuoteMessage);
          break;
      }
    }
  }

  private handleTrade(trade: PolygonTradeMessage) {
    this.emit('trade', {
      symbol: trade.sym,
      price: trade.p,
      size: trade.s,
      timestamp: new Date(trade.t),
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
      const params = symbols.map((s) => `T.${s},Q.${s}`).join(',');
      this.ws.send(JSON.stringify({ action: 'subscribe', params }));
      symbols.forEach((s) => this.subscribedSymbols.add(s));
      this.logger.log(`Subscribed to: ${symbols.join(', ')}`);
    }
  }

  unsubscribe(symbols: string[]) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const params = symbols.map((s) => `T.${s},Q.${s}`).join(',');
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

      return {
        symbol,
        price: ticker.lastTrade?.p || day.c || 0,
        change: (day.c || 0) - (prevDay.c || 0),
        changePercent: prevDay.c ? ((day.c - prevDay.c) / prevDay.c) * 100 : 0,
        volume: day.v || 0,
        timestamp: new Date(ticker.lastTrade?.t || Date.now()),
        open: day.o,
        high: day.h,
        low: day.l,
        previousClose: prevDay.c,
      };
    } catch (error) {
      this.logger.error(`Failed to get snapshot for ${symbol} from Polygon`, error);
      return null;
    }
  }
}
