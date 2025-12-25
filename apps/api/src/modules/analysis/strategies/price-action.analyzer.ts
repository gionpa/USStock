import { Injectable, Logger } from '@nestjs/common';
import { StockQuote } from '@/common/interfaces';
import { OHLCV } from '../indicators/technical.indicators';

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

@Injectable()
export class PriceActionAnalyzer {
  private readonly logger = new Logger(PriceActionAnalyzer.name);

  analyze(quote: StockQuote, candles: OHLCV[]): PriceActionResult {
    const currentPrice = quote.price;
    const priceChange24h = quote.change;
    const priceChangePercent24h = quote.changePercent;

    // Calculate volatility (standard deviation of returns)
    const volatility = this.calculateVolatility(candles);

    // Calculate momentum
    const momentum = this.calculateMomentum(candles);

    // Find support and resistance levels
    const { support, resistance } = this.findSupportResistance(candles);

    // Detect price patterns
    const patterns = this.detectPatterns(candles);

    return {
      symbol: quote.symbol,
      currentPrice,
      priceChange24h,
      priceChangePercent24h,
      volatility,
      momentum,
      supportLevels: support,
      resistanceLevels: resistance,
      patterns,
      timestamp: new Date(),
    };
  }

  private calculateVolatility(candles: OHLCV[]): number {
    if (candles.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const dailyReturn =
        (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
      returns.push(dailyReturn);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map((r) => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;

    return Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility
  }

  private calculateMomentum(candles: OHLCV[]): number {
    if (candles.length < 10) return 0;

    const recentClose = candles[candles.length - 1].close;
    const pastClose = candles[candles.length - 10].close;

    return ((recentClose - pastClose) / pastClose) * 100;
  }

  private findSupportResistance(
    candles: OHLCV[],
  ): { support: number[]; resistance: number[] } {
    if (candles.length < 20) {
      return { support: [], resistance: [] };
    }

    const prices = candles.map((c) => ({ high: c.high, low: c.low }));
    const support: number[] = [];
    const resistance: number[] = [];

    // Find local minima and maxima
    for (let i = 2; i < prices.length - 2; i++) {
      const current = prices[i];
      const prev1 = prices[i - 1];
      const prev2 = prices[i - 2];
      const next1 = prices[i + 1];
      const next2 = prices[i + 2];

      // Local minimum (support)
      if (
        current.low < prev1.low &&
        current.low < prev2.low &&
        current.low < next1.low &&
        current.low < next2.low
      ) {
        support.push(current.low);
      }

      // Local maximum (resistance)
      if (
        current.high > prev1.high &&
        current.high > prev2.high &&
        current.high > next1.high &&
        current.high > next2.high
      ) {
        resistance.push(current.high);
      }
    }

    // Sort and deduplicate (combine nearby levels)
    const consolidate = (levels: number[]): number[] => {
      if (levels.length === 0) return [];
      const sorted = [...levels].sort((a, b) => a - b);
      const result: number[] = [];
      let current = sorted[0];
      let count = 1;

      for (let i = 1; i < sorted.length; i++) {
        if ((sorted[i] - current) / current < 0.02) {
          // Within 2%
          current = (current * count + sorted[i]) / (count + 1);
          count++;
        } else {
          result.push(current);
          current = sorted[i];
          count = 1;
        }
      }
      result.push(current);
      return result.slice(-3); // Return top 3 levels
    };

    return {
      support: consolidate(support),
      resistance: consolidate(resistance),
    };
  }

  private detectPatterns(candles: OHLCV[]): PricePattern[] {
    const patterns: PricePattern[] = [];

    if (candles.length < 3) return patterns;

    // Check for various patterns
    const lastCandles = candles.slice(-5);

    // Bullish Engulfing
    if (this.isBullishEngulfing(lastCandles)) {
      patterns.push({
        name: 'Bullish Engulfing',
        type: 'bullish',
        confidence: 0.7,
        description: 'A bullish reversal pattern where a large green candle engulfs the previous red candle',
      });
    }

    // Bearish Engulfing
    if (this.isBearishEngulfing(lastCandles)) {
      patterns.push({
        name: 'Bearish Engulfing',
        type: 'bearish',
        confidence: 0.7,
        description: 'A bearish reversal pattern where a large red candle engulfs the previous green candle',
      });
    }

    // Doji
    if (this.isDoji(lastCandles[lastCandles.length - 1])) {
      patterns.push({
        name: 'Doji',
        type: 'neutral',
        confidence: 0.5,
        description: 'Indecision pattern where open and close are very close, suggesting potential reversal',
      });
    }

    // Hammer
    if (this.isHammer(lastCandles[lastCandles.length - 1])) {
      patterns.push({
        name: 'Hammer',
        type: 'bullish',
        confidence: 0.6,
        description: 'Bullish reversal pattern with a small body and long lower shadow',
      });
    }

    // Three White Soldiers
    if (this.isThreeWhiteSoldiers(lastCandles)) {
      patterns.push({
        name: 'Three White Soldiers',
        type: 'bullish',
        confidence: 0.8,
        description: 'Strong bullish pattern with three consecutive large green candles',
      });
    }

    // Three Black Crows
    if (this.isThreeBlackCrows(lastCandles)) {
      patterns.push({
        name: 'Three Black Crows',
        type: 'bearish',
        confidence: 0.8,
        description: 'Strong bearish pattern with three consecutive large red candles',
      });
    }

    return patterns;
  }

  private isBullishEngulfing(candles: OHLCV[]): boolean {
    if (candles.length < 2) return false;
    const prev = candles[candles.length - 2];
    const curr = candles[candles.length - 1];

    return (
      prev.close < prev.open && // Previous is red
      curr.close > curr.open && // Current is green
      curr.open < prev.close && // Current opens below prev close
      curr.close > prev.open // Current closes above prev open
    );
  }

  private isBearishEngulfing(candles: OHLCV[]): boolean {
    if (candles.length < 2) return false;
    const prev = candles[candles.length - 2];
    const curr = candles[candles.length - 1];

    return (
      prev.close > prev.open && // Previous is green
      curr.close < curr.open && // Current is red
      curr.open > prev.close && // Current opens above prev close
      curr.close < prev.open // Current closes below prev open
    );
  }

  private isDoji(candle: OHLCV): boolean {
    const bodySize = Math.abs(candle.close - candle.open);
    const totalRange = candle.high - candle.low;
    return totalRange > 0 && bodySize / totalRange < 0.1;
  }

  private isHammer(candle: OHLCV): boolean {
    const bodySize = Math.abs(candle.close - candle.open);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);

    return lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5;
  }

  private isThreeWhiteSoldiers(candles: OHLCV[]): boolean {
    if (candles.length < 3) return false;
    const last3 = candles.slice(-3);

    return last3.every((c, i) => {
      if (c.close <= c.open) return false; // Must be green
      if (i === 0) return true;
      return c.close > last3[i - 1].close; // Each closes higher
    });
  }

  private isThreeBlackCrows(candles: OHLCV[]): boolean {
    if (candles.length < 3) return false;
    const last3 = candles.slice(-3);

    return last3.every((c, i) => {
      if (c.close >= c.open) return false; // Must be red
      if (i === 0) return true;
      return c.close < last3[i - 1].close; // Each closes lower
    });
  }
}
