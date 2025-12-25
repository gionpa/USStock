import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NewsService } from '../news/news.service';
import { QuotesService } from '../quotes/quotes.service';
import { TechnicalIndicators, TechnicalAnalysisResult, OHLCV } from './indicators/technical.indicators';
import { SentimentAnalyzer, SentimentAnalysisResult } from './strategies/sentiment.analyzer';
import { PriceActionAnalyzer, PriceActionResult } from './strategies/price-action.analyzer';
import { TradingSignal, SignalReasoning } from '@/common/interfaces';

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

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly analysisCache = new Map<string, ComprehensiveAnalysis>();

  constructor(
    private readonly newsService: NewsService,
    private readonly quotesService: QuotesService,
    private readonly technicalIndicators: TechnicalIndicators,
    private readonly sentimentAnalyzer: SentimentAnalyzer,
    private readonly priceActionAnalyzer: PriceActionAnalyzer,
    @InjectQueue('analysis-processing') private readonly analysisQueue: Queue,
  ) {}

  async analyzeSymbol(symbol: string): Promise<ComprehensiveAnalysis> {
    // Check cache (valid for 1 minute)
    const cached = this.analysisCache.get(symbol);
    if (cached && Date.now() - cached.timestamp.getTime() < 60000) {
      return cached;
    }

    this.logger.log(`Running comprehensive analysis for ${symbol}`);

    // Fetch all required data in parallel
    const [quote, news, sentiment] = await Promise.all([
      this.quotesService.getQuote(symbol),
      this.newsService.getNewsForSymbol(symbol),
      this.newsService.getSentimentForSymbol(symbol),
    ]);

    if (!quote) {
      throw new Error(`Unable to fetch quote for ${symbol}`);
    }

    // For demo purposes, create sample OHLCV data
    // In production, this would come from historical data API
    const candles = this.generateSampleCandles(quote);

    // Run analysis
    const technicalAnalysis = this.technicalIndicators.analyze(symbol, candles);
    const sentimentAnalysis = this.sentimentAnalyzer.analyzeSentiment(news);
    const priceActionAnalysis = this.priceActionAnalyzer.analyze(quote, candles);

    // Generate trading signal
    const signal = this.generateSignal(
      symbol,
      quote.price,
      technicalAnalysis,
      sentimentAnalysis,
      priceActionAnalysis,
    );

    const analysis: ComprehensiveAnalysis = {
      symbol,
      quote: {
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
      },
      technical: technicalAnalysis,
      sentiment: sentimentAnalysis,
      priceAction: priceActionAnalysis,
      signal,
      timestamp: new Date(),
    };

    this.analysisCache.set(symbol, analysis);

    return analysis;
  }

  private generateSignal(
    symbol: string,
    currentPrice: number,
    technical: TechnicalAnalysisResult,
    sentiment: SentimentAnalysisResult | null,
    priceAction: PriceActionResult,
  ): TradingSignal {
    const reasoning: SignalReasoning[] = [];
    let buyScore = 0;
    let sellScore = 0;

    // Technical Analysis (40% weight)
    if (technical.signals.trend === 'bullish') {
      buyScore += 20;
      reasoning.push({
        source: 'technical',
        description: `Bullish trend: Price above SMA20 (${technical.indicators.sma.sma20.toFixed(2)})`,
        weight: 20,
      });
    } else if (technical.signals.trend === 'bearish') {
      sellScore += 20;
      reasoning.push({
        source: 'technical',
        description: `Bearish trend: Price below SMA20 (${technical.indicators.sma.sma20.toFixed(2)})`,
        weight: 20,
      });
    }

    if (technical.signals.momentum === 'oversold') {
      buyScore += 15;
      reasoning.push({
        source: 'technical',
        description: `RSI oversold at ${technical.indicators.rsi.toFixed(1)}`,
        weight: 15,
      });
    } else if (technical.signals.momentum === 'overbought') {
      sellScore += 15;
      reasoning.push({
        source: 'technical',
        description: `RSI overbought at ${technical.indicators.rsi.toFixed(1)}`,
        weight: 15,
      });
    }

    if (technical.indicators.macd.histogram > 0) {
      buyScore += 5;
      reasoning.push({
        source: 'technical',
        description: 'MACD histogram positive',
        weight: 5,
      });
    } else {
      sellScore += 5;
      reasoning.push({
        source: 'technical',
        description: 'MACD histogram negative',
        weight: 5,
      });
    }

    // Sentiment Analysis (30% weight)
    if (sentiment) {
      if (sentiment.overallSentiment.label === 'bullish') {
        buyScore += 20;
        reasoning.push({
          source: 'sentiment',
          description: `Bullish news sentiment (${(sentiment.overallSentiment.score * 100).toFixed(0)}%)`,
          weight: 20,
        });
      } else if (sentiment.overallSentiment.label === 'bearish') {
        sellScore += 20;
        reasoning.push({
          source: 'sentiment',
          description: `Bearish news sentiment (${(sentiment.overallSentiment.score * 100).toFixed(0)}%)`,
          weight: 20,
        });
      }

      if (sentiment.sentimentTrend === 'improving') {
        buyScore += 10;
        reasoning.push({
          source: 'sentiment',
          description: 'Sentiment trend improving',
          weight: 10,
        });
      } else if (sentiment.sentimentTrend === 'declining') {
        sellScore += 10;
        reasoning.push({
          source: 'sentiment',
          description: 'Sentiment trend declining',
          weight: 10,
        });
      }
    }

    // Price Action (30% weight)
    for (const pattern of priceAction.patterns) {
      if (pattern.type === 'bullish') {
        buyScore += pattern.confidence * 15;
        reasoning.push({
          source: 'technical',
          description: `${pattern.name} pattern detected`,
          weight: pattern.confidence * 15,
        });
      } else if (pattern.type === 'bearish') {
        sellScore += pattern.confidence * 15;
        reasoning.push({
          source: 'technical',
          description: `${pattern.name} pattern detected`,
          weight: pattern.confidence * 15,
        });
      }
    }

    // Volume Analysis
    if (technical.indicators.volumeAnalysis.volumeRatio > 1.5) {
      if (priceAction.priceChangePercent24h > 0) {
        buyScore += 10;
        reasoning.push({
          source: 'volume',
          description: `High volume on up move (${technical.indicators.volumeAnalysis.volumeRatio.toFixed(1)}x avg)`,
          weight: 10,
        });
      } else {
        sellScore += 10;
        reasoning.push({
          source: 'volume',
          description: `High volume on down move (${technical.indicators.volumeAnalysis.volumeRatio.toFixed(1)}x avg)`,
          weight: 10,
        });
      }
    }

    // Determine signal type and strength
    const netScore = buyScore - sellScore;
    const totalScore = buyScore + sellScore;
    const strength = Math.min(Math.abs(netScore), 100);

    let signalType: 'buy' | 'sell' | 'hold' = 'hold';
    if (netScore > 20) {
      signalType = 'buy';
    } else if (netScore < -20) {
      signalType = 'sell';
    }

    // Calculate target price and stop loss
    const targetPrice =
      signalType === 'buy'
        ? currentPrice * (1 + strength / 500) // 0.2% per point
        : signalType === 'sell'
          ? currentPrice * (1 - strength / 500)
          : undefined;

    const stopLoss =
      signalType === 'buy'
        ? currentPrice * 0.95 // 5% stop loss
        : signalType === 'sell'
          ? currentPrice * 1.05
          : undefined;

    return {
      id: `signal_${symbol}_${Date.now()}`,
      symbol,
      type: signalType,
      strength,
      price: currentPrice,
      targetPrice,
      stopLoss,
      reasoning: reasoning.sort((a, b) => b.weight - a.weight),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  }

  private generateSampleCandles(quote: any): OHLCV[] {
    // Generate 50 sample candles for demo
    // In production, fetch from historical data API
    const candles: OHLCV[] = [];
    let price = quote.price * 0.9; // Start 10% lower

    for (let i = 0; i < 50; i++) {
      const change = (Math.random() - 0.48) * price * 0.03;
      const open = price;
      price += change;
      const close = price;
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      const volume = Math.floor(Math.random() * 10000000) + 1000000;

      candles.push({
        open,
        high,
        low,
        close,
        volume,
        timestamp: new Date(Date.now() - (50 - i) * 24 * 60 * 60 * 1000),
      });
    }

    return candles;
  }

  async queueAnalysis(symbol: string): Promise<void> {
    await this.analysisQueue.add('analyze', { symbol }, { priority: 1 });
  }
}
