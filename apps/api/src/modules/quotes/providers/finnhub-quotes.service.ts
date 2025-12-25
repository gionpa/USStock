import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { EventEmitter } from 'events';
import * as WebSocket from 'ws';
import { StockQuote } from '@/common/interfaces';

interface FinnhubQuoteResponse {
  c: number; // current price
  d: number; // change
  dp: number; // percent change
  h: number; // high
  l: number; // low
  o: number; // open
  pc: number; // previous close
  t: number; // timestamp
}

interface FinnhubTradeMessage {
  type: string;
  data: Array<{
    s: string; // symbol
    p: number; // price
    v: number; // volume
    t: number; // timestamp
    c?: string[]; // conditions
  }>;
}

@Injectable()
export class FinnhubQuotesService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FinnhubQuotesService.name);
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private readonly apiKey: string;
  private ws: WebSocket | null = null;
  private subscribedSymbols = new Set<string>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    super();
    this.baseUrl = this.configService.get<string>('finnhub.baseUrl')!;
    this.wsUrl = this.configService.get<string>('finnhub.wsUrl')!;
    this.apiKey = this.configService.get<string>('finnhub.apiKey')!;
  }

  onModuleInit() {
    if (this.apiKey) {
      this.connectWebSocket();
    } else {
      this.logger.warn('Finnhub API key not configured, WebSocket disabled');
    }
  }

  onModuleDestroy() {
    this.disconnectWebSocket();
  }

  private connectWebSocket() {
    try {
      this.ws = new WebSocket(`${this.wsUrl}?token=${this.apiKey}`);

      this.ws.on('open', () => {
        this.logger.log('Connected to Finnhub WebSocket');
        this.reconnectAttempts = 0;
        this.resubscribeSymbols();
        this.startPingInterval();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(JSON.parse(data.toString()));
      });

      this.ws.on('close', () => {
        this.logger.warn('Finnhub WebSocket connection closed');
        this.stopPingInterval();
        this.attemptReconnect();
      });

      this.ws.on('error', (error) => {
        this.logger.error('Finnhub WebSocket error:', error);
      });
    } catch (error) {
      this.logger.error('Failed to connect to Finnhub WebSocket', error);
    }
  }

  private handleMessage(message: FinnhubTradeMessage) {
    if (message.type === 'trade' && message.data) {
      for (const trade of message.data) {
        this.emit('trade', {
          symbol: trade.s,
          price: trade.p,
          volume: trade.v,
          timestamp: new Date(trade.t),
          conditions: trade.c,
        });
      }
    } else if (message.type === 'ping') {
      // Handle ping from server
      this.ws?.send(JSON.stringify({ type: 'pong' }));
    }
  }

  private startPingInterval() {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect() {
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
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private resubscribeSymbols() {
    if (this.subscribedSymbols.size > 0) {
      const symbols = Array.from(this.subscribedSymbols);
      symbols.forEach((symbol) => this.subscribeToSymbol(symbol));
    }
  }

  private subscribeToSymbol(symbol: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  }

  subscribe(symbols: string[]) {
    symbols.forEach((symbol) => {
      this.subscribedSymbols.add(symbol);
      this.subscribeToSymbol(symbol);
    });
    this.logger.log(`Subscribed to: ${symbols.join(', ')}`);
  }

  unsubscribe(symbols: string[]) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      symbols.forEach((symbol) => {
        this.subscribedSymbols.delete(symbol);
        this.ws?.send(JSON.stringify({ type: 'unsubscribe', symbol }));
      });
      this.logger.log(`Unsubscribed from: ${symbols.join(', ')}`);
    }
  }

  async getQuote(symbol: string): Promise<StockQuote | null> {
    try {
      const url = `${this.baseUrl}/quote`;
      const response = await firstValueFrom(
        this.httpService.get<FinnhubQuoteResponse>(url, {
          params: {
            symbol,
            token: this.apiKey,
          },
        }),
      );

      const data = response.data;
      if (!data || data.c === 0) return null;

      return {
        symbol,
        price: data.c,
        change: data.d,
        changePercent: data.dp,
        volume: 0, // Finnhub quote doesn't include volume
        timestamp: new Date(data.t * 1000),
        open: data.o,
        high: data.h,
        low: data.l,
        previousClose: data.pc,
      };
    } catch (error) {
      this.logger.error(`Failed to get quote for ${symbol} from Finnhub`, error);
      return null;
    }
  }

  async getCandles(
    symbol: string,
    resolution: string = 'D',
    from: number,
    to: number,
  ): Promise<any> {
    try {
      const url = `${this.baseUrl}/stock/candle`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            symbol,
            resolution,
            from,
            to,
            token: this.apiKey,
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get candles for ${symbol} from Finnhub`, error);
      return null;
    }
  }
}
