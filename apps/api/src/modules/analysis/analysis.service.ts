import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NewsService } from '../news/news.service';
import { QuotesService } from '../quotes/quotes.service';
import { TechnicalIndicators, TechnicalAnalysisResult, OHLCV } from './indicators/technical.indicators';
import { SentimentAnalyzer, SentimentAnalysisResult } from './strategies/sentiment.analyzer';
import { PriceActionAnalyzer, PriceActionResult } from './strategies/price-action.analyzer';
import { TradingSignal, SignalReasoning, StockPriceHistoryPoint } from '@/common/interfaces';

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
  // Store previous signal to implement stability logic
  private readonly previousSignals = new Map<string, { type: 'buy' | 'sell' | 'hold'; score: number; timestamp: number }>();
  // Cache OHLCV data to ensure consistency within analysis window
  private readonly ohlcvCache = new Map<string, { candles: OHLCV[]; timestamp: number }>();

  constructor(
    private readonly newsService: NewsService,
    private readonly quotesService: QuotesService,
    private readonly technicalIndicators: TechnicalIndicators,
    private readonly sentimentAnalyzer: SentimentAnalyzer,
    private readonly priceActionAnalyzer: PriceActionAnalyzer,
    @InjectQueue('analysis-processing') private readonly analysisQueue: Queue,
  ) {}

  async analyzeSymbol(symbol: string): Promise<ComprehensiveAnalysis> {
    // Check cache (valid for 5 minutes for stability)
    const cached = this.analysisCache.get(symbol);
    if (cached && Date.now() - cached.timestamp.getTime() < 300000) {
      return cached;
    }

    this.logger.log(`Running comprehensive analysis for ${symbol}`);

    // Fetch all required data in parallel
    const [quote, news, sentiment, historyData] = await Promise.all([
      this.quotesService.getQuote(symbol),
      this.newsService.getNewsForSymbol(symbol),
      this.newsService.getSentimentForSymbol(symbol),
      this.quotesService.getHistory(symbol, '3m'), // Get 3 months of real data
    ]);

    if (!quote) {
      throw new Error(`Unable to fetch quote for ${symbol}`);
    }

    // Use real historical data to generate OHLCV candles
    const candles = this.convertHistoryToOHLCV(historyData, quote);

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

    // ============================================
    // TECHNICAL ANALYSIS (50% weight - most reliable)
    // ============================================

    // 1. Trend Analysis (25 points max)
    // Primary trend from SMA alignment
    if (technical.signals.trend === 'bullish') {
      buyScore += 15;
      reasoning.push({
        source: 'technical',
        description: `상승 추세: 가격이 SMA20 (${technical.indicators.sma.sma20.toFixed(2)}) 위에서 거래 중`,
        weight: 15,
      });
      // Bonus for strong trend (price > SMA50)
      if (currentPrice > technical.indicators.sma.sma50) {
        buyScore += 10;
        reasoning.push({
          source: 'technical',
          description: `강한 상승세: SMA50 (${technical.indicators.sma.sma50.toFixed(2)}) 돌파`,
          weight: 10,
        });
      }
    } else if (technical.signals.trend === 'bearish') {
      sellScore += 15;
      reasoning.push({
        source: 'technical',
        description: `하락 추세: 가격이 SMA20 (${technical.indicators.sma.sma20.toFixed(2)}) 아래에서 거래 중`,
        weight: 15,
      });
      if (currentPrice < technical.indicators.sma.sma50) {
        sellScore += 10;
        reasoning.push({
          source: 'technical',
          description: `강한 하락세: SMA50 (${technical.indicators.sma.sma50.toFixed(2)}) 하회`,
          weight: 10,
        });
      }
    }

    // 2. RSI Momentum (15 points max) - Only extreme values
    // Use wider bands for stability (25/75 instead of 30/70)
    if (technical.indicators.rsi < 25) {
      buyScore += 15;
      reasoning.push({
        source: 'technical',
        description: `RSI 과매도 (${technical.indicators.rsi.toFixed(1)}) - 반등 가능성`,
        weight: 15,
      });
    } else if (technical.indicators.rsi > 75) {
      sellScore += 15;
      reasoning.push({
        source: 'technical',
        description: `RSI 과매수 (${technical.indicators.rsi.toFixed(1)}) - 조정 가능성`,
        weight: 15,
      });
    } else if (technical.indicators.rsi < 40) {
      buyScore += 5;
      reasoning.push({
        source: 'technical',
        description: `RSI 약세 구간 (${technical.indicators.rsi.toFixed(1)})`,
        weight: 5,
      });
    } else if (technical.indicators.rsi > 60) {
      sellScore += 5;
      reasoning.push({
        source: 'technical',
        description: `RSI 강세 구간 (${technical.indicators.rsi.toFixed(1)})`,
        weight: 5,
      });
    }

    // 3. MACD (10 points max) - Only when histogram is significant
    const macdThreshold = currentPrice * 0.001; // 0.1% of price as threshold
    if (Math.abs(technical.indicators.macd.histogram) > macdThreshold) {
      if (technical.indicators.macd.histogram > 0) {
        buyScore += 10;
        reasoning.push({
          source: 'technical',
          description: 'MACD 히스토그램 양수 - 상승 모멘텀',
          weight: 10,
        });
      } else {
        sellScore += 10;
        reasoning.push({
          source: 'technical',
          description: 'MACD 히스토그램 음수 - 하락 모멘텀',
          weight: 10,
        });
      }
    }

    // ============================================
    // SENTIMENT ANALYSIS (25% weight - requires minimum news)
    // ============================================
    if (sentiment && sentiment.newsCount >= 3) {
      // Only consider sentiment if we have enough news (min 3 articles)
      const sentimentConfidence = sentiment.overallSentiment.confidence;

      // Scale sentiment score by confidence (high confidence = more weight)
      if (sentiment.overallSentiment.label === 'bullish' && sentimentConfidence > 0.3) {
        const weight = Math.round(15 * sentimentConfidence);
        buyScore += weight;
        reasoning.push({
          source: 'sentiment',
          description: `긍정적 뉴스 (점수: ${(sentiment.overallSentiment.score * 100).toFixed(0)}%, 신뢰도: ${(sentimentConfidence * 100).toFixed(0)}%)`,
          weight,
        });
      } else if (sentiment.overallSentiment.label === 'bearish' && sentimentConfidence > 0.3) {
        const weight = Math.round(15 * sentimentConfidence);
        sellScore += weight;
        reasoning.push({
          source: 'sentiment',
          description: `부정적 뉴스 (점수: ${(sentiment.overallSentiment.score * 100).toFixed(0)}%, 신뢰도: ${(sentimentConfidence * 100).toFixed(0)}%)`,
          weight,
        });
      }

      // Sentiment trend (only if clear direction)
      if (sentiment.sentimentTrend === 'improving' && sentiment.recentNewsScore > 0.15) {
        buyScore += 10;
        reasoning.push({
          source: 'sentiment',
          description: '뉴스 심리 개선 추세',
          weight: 10,
        });
      } else if (sentiment.sentimentTrend === 'declining' && sentiment.recentNewsScore < -0.15) {
        sellScore += 10;
        reasoning.push({
          source: 'sentiment',
          description: '뉴스 심리 악화 추세',
          weight: 10,
        });
      }

      // High risk penalty
      if (sentiment.riskLevel === 'high') {
        sellScore += 15;
        reasoning.push({
          source: 'sentiment',
          description: '높은 리스크 키워드 감지 (소송, 조사 등)',
          weight: 15,
        });
      }
    }

    // ============================================
    // PRICE ACTION (25% weight - only strong patterns)
    // ============================================
    for (const pattern of priceAction.patterns) {
      // Only consider patterns with high confidence (> 0.6)
      if (pattern.confidence > 0.6) {
        const weight = Math.round(pattern.confidence * 12);
        if (pattern.type === 'bullish') {
          buyScore += weight;
          reasoning.push({
            source: 'technical',
            description: `${pattern.name} 패턴 (신뢰도: ${(pattern.confidence * 100).toFixed(0)}%)`,
            weight,
          });
        } else if (pattern.type === 'bearish') {
          sellScore += weight;
          reasoning.push({
            source: 'technical',
            description: `${pattern.name} 패턴 (신뢰도: ${(pattern.confidence * 100).toFixed(0)}%)`,
            weight,
          });
        }
      }
    }

    // Volume confirmation (only significant volume spikes)
    if (technical.indicators.volumeAnalysis.volumeRatio > 2.0) {
      const volumeWeight = 8;
      if (priceAction.priceChangePercent24h > 1) {
        buyScore += volumeWeight;
        reasoning.push({
          source: 'volume',
          description: `급등 시 거래량 폭증 (${technical.indicators.volumeAnalysis.volumeRatio.toFixed(1)}배)`,
          weight: volumeWeight,
        });
      } else if (priceAction.priceChangePercent24h < -1) {
        sellScore += volumeWeight;
        reasoning.push({
          source: 'volume',
          description: `급락 시 거래량 폭증 (${technical.indicators.volumeAnalysis.volumeRatio.toFixed(1)}배)`,
          weight: volumeWeight,
        });
      }
    }

    // ============================================
    // SIGNAL DETERMINATION WITH STABILITY LOGIC
    // ============================================
    const netScore = buyScore - sellScore;

    // Thresholds for signal determination
    // BUY: net score > 15 (moderate bullish bias)
    // SELL: net score < -15 (moderate bearish bias)
    // HOLD zone: -15 to +15 (unclear direction)
    const BUY_THRESHOLD = 15;
    const SELL_THRESHOLD = -15;

    // Hysteresis: once a signal is established, require it to cross
    // further to change (prevents rapid flip-flopping)
    const previousSignal = this.previousSignals.get(symbol);
    let signalType: 'buy' | 'sell' | 'hold' = 'hold';

    if (previousSignal) {
      const timeSinceLastSignal = Date.now() - previousSignal.timestamp;
      const minSignalDuration = 10 * 60 * 1000; // 10 minutes minimum before flip

      if (timeSinceLastSignal < minSignalDuration) {
        // Recent signal - apply hysteresis
        if (previousSignal.type === 'buy') {
          // To flip from BUY: need to cross into SELL zone
          if (netScore < SELL_THRESHOLD) {
            signalType = 'sell';
          } else if (netScore > 0) {
            signalType = 'buy'; // maintain buy if still positive
          }
          // else stays HOLD (buy signal weakened but not reversed)
        } else if (previousSignal.type === 'sell') {
          // To flip from SELL: need to cross into BUY zone
          if (netScore > BUY_THRESHOLD) {
            signalType = 'buy';
          } else if (netScore < 0) {
            signalType = 'sell'; // maintain sell if still negative
          }
          // else stays HOLD (sell signal weakened but not reversed)
        } else {
          // Previous was HOLD - use normal thresholds
          if (netScore >= BUY_THRESHOLD) signalType = 'buy';
          else if (netScore <= SELL_THRESHOLD) signalType = 'sell';
        }
      } else {
        // Enough time passed, use normal thresholds
        if (netScore >= BUY_THRESHOLD) signalType = 'buy';
        else if (netScore <= SELL_THRESHOLD) signalType = 'sell';
      }
    } else {
      // No previous signal - use normal thresholds
      if (netScore >= BUY_THRESHOLD) signalType = 'buy';
      else if (netScore <= SELL_THRESHOLD) signalType = 'sell';
    }

    // Store current signal for future stability checks
    this.previousSignals.set(symbol, {
      type: signalType,
      score: netScore,
      timestamp: Date.now(),
    });

    // Calculate strength (0-100)
    // Normalize based on max possible score (~100)
    const strength = Math.min(Math.round(Math.abs(netScore) * 1.2), 100);

    // Calculate target price and stop loss based on volatility
    const volatilityMultiplier = technical.signals.volatility === 'high' ? 1.5 :
                                 technical.signals.volatility === 'low' ? 0.7 : 1.0;

    const targetPrice =
      signalType === 'buy'
        ? currentPrice * (1 + (strength / 400) * volatilityMultiplier)
        : signalType === 'sell'
          ? currentPrice * (1 - (strength / 400) * volatilityMultiplier)
          : undefined;

    const stopLoss =
      signalType === 'buy'
        ? currentPrice * (1 - 0.05 * volatilityMultiplier) // 5% base, adjusted for volatility
        : signalType === 'sell'
          ? currentPrice * (1 + 0.05 * volatilityMultiplier)
          : undefined;

    return {
      id: `signal_${symbol}_${Date.now()}`,
      symbol,
      type: signalType,
      strength,
      price: currentPrice,
      targetPrice,
      stopLoss,
      reasoning: reasoning.sort((a, b) => b.weight - a.weight).slice(0, 8), // Top 8 reasons
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  }

  /**
   * Convert historical price data to OHLCV format
   * Since we only have daily close prices, we estimate OHLCV values
   */
  private convertHistoryToOHLCV(history: StockPriceHistoryPoint[], quote: any): OHLCV[] {
    if (!history || history.length === 0) {
      this.logger.warn('No historical data available, using fallback');
      return this.generateFallbackCandles(quote);
    }

    const candles: OHLCV[] = [];

    for (let i = 0; i < history.length; i++) {
      const point = history[i];
      const prevPrice = i > 0 ? history[i - 1].price : point.price;

      // Calculate estimated OHLCV from daily close prices
      // Use price movement to estimate intraday range
      const priceChange = point.price - prevPrice;
      const volatility = Math.abs(priceChange) / prevPrice;
      const estimatedRange = Math.max(volatility, 0.01) * point.price; // Min 1% range

      // Estimate open, high, low based on close price and trend
      const open = prevPrice;
      const close = point.price;
      const high = Math.max(open, close) + estimatedRange * 0.3;
      const low = Math.min(open, close) - estimatedRange * 0.3;

      // Estimate volume based on price movement (higher movement = higher volume)
      const baseVolume = quote.volume || 5000000;
      const volumeMultiplier = 1 + volatility * 5; // More volatile = more volume
      const volume = Math.round(baseVolume * volumeMultiplier * (0.8 + Math.random() * 0.4));

      candles.push({
        open,
        high,
        low,
        close,
        volume,
        timestamp: new Date(point.timestamp),
      });
    }

    // Add current day's data if not already included
    const lastCandle = candles[candles.length - 1];
    const lastTimestamp = lastCandle?.timestamp.getTime() || 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (lastTimestamp < today.getTime() && quote) {
      candles.push({
        open: lastCandle?.close || quote.price,
        high: Math.max(quote.high || quote.price, quote.price),
        low: Math.min(quote.low || quote.price, quote.price),
        close: quote.price,
        volume: quote.volume || 5000000,
        timestamp: new Date(),
      });
    }

    return candles;
  }

  /**
   * Fallback candle generation when no historical data is available
   * Uses a deterministic approach based on current price to ensure consistency
   */
  private generateFallbackCandles(quote: any): OHLCV[] {
    const candles: OHLCV[] = [];
    const currentPrice = quote.price || 100;

    // Use a seeded approach for consistency (based on price)
    const seed = Math.floor(currentPrice * 100);
    let price = currentPrice * 0.95; // Start 5% lower

    for (let i = 0; i < 60; i++) {
      // Deterministic pseudo-random based on seed and index
      const pseudoRandom = ((seed * (i + 1) * 9301 + 49297) % 233280) / 233280;
      const change = (pseudoRandom - 0.48) * price * 0.02;

      const open = price;
      price = Math.max(price + change, currentPrice * 0.5); // Don't go below 50% of current
      price = Math.min(price, currentPrice * 1.5); // Don't go above 150% of current

      // Gradually move towards current price
      const targetWeight = i / 60;
      price = price * (1 - targetWeight * 0.1) + currentPrice * targetWeight * 0.1;

      const close = price;
      const range = Math.abs(close - open) + currentPrice * 0.005;
      const high = Math.max(open, close) + range * 0.3;
      const low = Math.min(open, close) - range * 0.3;
      const volume = Math.floor(5000000 * (0.8 + pseudoRandom * 0.4));

      candles.push({
        open,
        high,
        low,
        close,
        volume,
        timestamp: new Date(Date.now() - (60 - i) * 24 * 60 * 60 * 1000),
      });
    }

    return candles;
  }

  async queueAnalysis(symbol: string): Promise<void> {
    await this.analysisQueue.add('analyze', { symbol }, { priority: 1 });
  }
}
