import { Injectable } from '@nestjs/common';

export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

@Injectable()
export class TechnicalIndicators {
  // Simple Moving Average
  calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return 0;
    const slice = prices.slice(-period);
    return slice.reduce((sum, p) => sum + p, 0) / period;
  }

  // Exponential Moving Average
  calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return 0;

    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(prices.slice(0, period), period);

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  // Relative Strength Index
  calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) {
        gains += diff;
      } else {
        losses += Math.abs(diff);
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) {
        avgGain = (avgGain * (period - 1) + diff) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
      }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  // MACD (Moving Average Convergence Divergence)
  calculateMACD(
    prices: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9,
  ): { macd: number; signal: number; histogram: number } {
    if (prices.length < slowPeriod + signalPeriod) {
      return { macd: 0, signal: 0, histogram: 0 };
    }

    // Calculate MACD line for each point (EMA12 - EMA26)
    const macdLine: number[] = [];

    for (let i = slowPeriod; i <= prices.length; i++) {
      const slice = prices.slice(0, i);
      const fastEMA = this.calculateEMA(slice, fastPeriod);
      const slowEMA = this.calculateEMA(slice, slowPeriod);
      macdLine.push(fastEMA - slowEMA);
    }

    // Calculate signal line (9-period EMA of MACD line)
    const signal = this.calculateEMA(macdLine, signalPeriod);
    const macd = macdLine[macdLine.length - 1];
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  // Bollinger Bands
  calculateBollingerBands(
    prices: number[],
    period: number = 20,
    stdDev: number = 2,
  ): { upper: number; middle: number; lower: number } {
    const sma = this.calculateSMA(prices, period);

    if (prices.length < period) {
      return { upper: 0, middle: 0, lower: 0 };
    }

    const slice = prices.slice(-period);
    const squaredDiffs = slice.map((p) => Math.pow(p - sma, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    return {
      upper: sma + stdDev * standardDeviation,
      middle: sma,
      lower: sma - stdDev * standardDeviation,
    };
  }

  // Average True Range (ATR)
  calculateATR(candles: OHLCV[], period: number = 14): number {
    if (candles.length < period + 1) return 0;

    const trueRanges: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const previous = candles[i - 1];

      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
      );
      trueRanges.push(tr);
    }

    return this.calculateSMA(trueRanges, period);
  }

  // Volume Analysis
  analyzeVolume(volumes: number[]): { avgVolume: number; volumeRatio: number } {
    if (volumes.length < 20) {
      return { avgVolume: 0, volumeRatio: 1 };
    }

    const avgVolume = this.calculateSMA(volumes.slice(0, -1), 20);
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    return { avgVolume, volumeRatio };
  }

  // Full Technical Analysis
  analyze(symbol: string, candles: OHLCV[]): TechnicalAnalysisResult {
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);
    const currentPrice = closes[closes.length - 1];

    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    const sma200 = this.calculateSMA(closes, 200);
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const rsi = this.calculateRSI(closes);
    const macd = this.calculateMACD(closes);
    const bollingerBands = this.calculateBollingerBands(closes);
    const atr = this.calculateATR(candles);
    const volumeAnalysis = this.analyzeVolume(volumes);

    // Determine trend
    // Use a more nuanced approach: primary signal from price vs SMA20
    // Secondary confirmation from SMA20 vs SMA50
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    const priceAboveSma20 = currentPrice > sma20;
    const sma20AboveSma50 = sma20 > sma50;

    if (priceAboveSma20) {
      // Price above SMA20 indicates short-term bullish
      trend = 'bullish';
    } else {
      // Price below SMA20 indicates short-term bearish
      trend = 'bearish';
    }

    // Determine momentum
    let momentum: 'overbought' | 'oversold' | 'neutral' = 'neutral';
    if (rsi > 70) {
      momentum = 'overbought';
    } else if (rsi < 30) {
      momentum = 'oversold';
    }

    // Determine volatility
    const priceRange = (bollingerBands.upper - bollingerBands.lower) / bollingerBands.middle;
    let volatility: 'high' | 'low' | 'normal' = 'normal';
    if (priceRange > 0.1) {
      volatility = 'high';
    } else if (priceRange < 0.03) {
      volatility = 'low';
    }

    return {
      symbol,
      indicators: {
        sma: { sma20, sma50, sma200 },
        ema: { ema12, ema26 },
        rsi,
        macd,
        bollingerBands,
        atr,
        volumeAnalysis,
      },
      signals: { trend, momentum, volatility },
      timestamp: new Date(),
    };
  }
}
