export type MarketSession = 'pre-market' | 'regular' | 'after-hours' | 'closed';

export interface ExtendedHoursData {
  price: number;
  change: number;
  changePercent: number;
  timestamp: Date;
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: Date;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  marketSession?: MarketSession;
  preMarket?: ExtendedHoursData;
  afterHours?: ExtendedHoursData;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: Date;
}

export interface OrderBookEntry {
  price: number;
  size: number;
}

export interface StockNews {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  symbols: string[];
  publishedAt: Date;
  sentiment?: NewsSentiment;
  keywords?: string[];
}

export interface NewsSentiment {
  score: number; // -1 to 1
  label: 'bearish' | 'neutral' | 'bullish';
  confidence: number; // 0 to 1
}

export interface TradingSignal {
  id: string;
  symbol: string;
  type: 'buy' | 'sell' | 'hold';
  strength: number; // 0 to 100
  price: number;
  targetPrice?: number;
  stopLoss?: number;
  reasoning: SignalReasoning[];
  createdAt: Date;
  expiresAt?: Date;
}

export interface SignalReasoning {
  source: 'news' | 'technical' | 'sentiment' | 'volume';
  description: string;
  weight: number;
}

export interface StockPriceHistoryPoint {
  timestamp: number;
  price: number;
}
