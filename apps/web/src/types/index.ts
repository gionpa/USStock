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
  // Korean translations
  titleKo?: string;
  summaryKo?: string | null;
}

export interface NewsSentiment {
  score: number;
  label: 'bearish' | 'neutral' | 'bullish';
  confidence: number;
}

export interface TradingSignal {
  id: string;
  symbol: string;
  type: 'buy' | 'sell' | 'hold';
  strength: number;
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

export interface ComprehensiveAnalysis {
  symbol: string;
  quote: {
    price: number;
    change: number;
    changePercent: number;
  };
  technical: TechnicalAnalysisResult | null;
  sentiment: SentimentAnalysisResult | null;
  priceAction: PriceActionResult | null;
  signal: TradingSignal | null;
  timestamp: Date;
}

export interface TechnicalAnalysisResult {
  symbol: string;
  indicators: {
    sma: { sma20: number; sma50: number; sma200: number };
    ema: { ema12: number; ema26: number };
    rsi: number;
    macd: { macd: number; signal: number; histogram: number };
    bollingerBands: { upper: number; middle: number; lower: number };
    atr: number;
    volumeAnalysis: { avgVolume: number; volumeRatio: number };
  };
  signals: {
    trend: 'bullish' | 'bearish' | 'neutral';
    momentum: 'overbought' | 'oversold' | 'neutral';
    volatility: 'high' | 'low' | 'normal';
  };
  timestamp: Date;
}

export interface SentimentAnalysisResult {
  symbol: string;
  overallSentiment: NewsSentiment;
  newsCount: number;
  recentNewsScore: number;
  sentimentTrend: 'improving' | 'declining' | 'stable';
  keyTopics: string[];
  riskLevel: 'low' | 'medium' | 'high';
  timestamp: Date;
}

export interface PriceActionResult {
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  volatility: number;
  momentum: number;
  supportLevels: number[];
  resistanceLevels: number[];
  patterns: PricePattern[];
  timestamp: Date;
}

export interface PricePattern {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  description: string;
}

export interface SignalSummary {
  totalSignals: number;
  buySignals: number;
  sellSignals: number;
  holdSignals: number;
  strongBuySignals: TradingSignal[];
  strongSellSignals: TradingSignal[];
  updatedAt: Date;
}

export interface PriceHistoryPoint {
  timestamp: number;
  price: number;
}

export interface QuarterlyFinancial {
  period: string;
  endDate?: string;
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  eps?: number;
  operatingCashFlow?: number;
}

export interface FinancialsResponse {
  symbol: string;
  currency?: string;
  usdToKrw: number;
  rateAsOf?: string;
  items: QuarterlyFinancial[];
  source: 'finnhub';
}
