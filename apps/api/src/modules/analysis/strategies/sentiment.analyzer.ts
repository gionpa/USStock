import { Injectable, Logger } from '@nestjs/common';
import { StockNews, NewsSentiment } from '@/common/interfaces';

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

@Injectable()
export class SentimentAnalyzer {
  private readonly logger = new Logger(SentimentAnalyzer.name);

  // Keywords that indicate positive sentiment
  private readonly positiveKeywords = [
    'upgrade', 'beat', 'outperform', 'growth', 'profit', 'gain',
    'surge', 'rally', 'breakout', 'bullish', 'strong', 'record',
    'innovation', 'partnership', 'acquisition', 'expansion',
  ];

  // Keywords that indicate negative sentiment
  private readonly negativeKeywords = [
    'downgrade', 'miss', 'underperform', 'decline', 'loss', 'drop',
    'plunge', 'crash', 'bearish', 'weak', 'warning', 'concern',
    'lawsuit', 'investigation', 'layoff', 'recall', 'bankruptcy',
  ];

  // Keywords that indicate high risk
  private readonly riskKeywords = [
    'sec', 'investigation', 'lawsuit', 'fraud', 'scandal',
    'recall', 'bankruptcy', 'default', 'debt', 'warning',
  ];

  analyzeSentiment(news: StockNews[]): SentimentAnalysisResult | null {
    if (news.length === 0) return null;

    const symbol = news[0].symbols[0] || 'UNKNOWN';
    const sentimentScores: number[] = [];
    const keyTopicsSet = new Set<string>();
    let riskScore = 0;

    for (const item of news) {
      const text = `${item.title} ${item.summary}`.toLowerCase();
      const score = this.calculateTextSentiment(text);
      sentimentScores.push(score);

      // Extract key topics
      this.extractTopics(text).forEach((topic) => keyTopicsSet.add(topic));

      // Calculate risk
      riskScore += this.calculateRiskScore(text);
    }

    // Calculate overall sentiment
    const avgScore = sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length;

    // Calculate recent news score (weighted towards more recent)
    const recentNewsScore = this.calculateRecentNewsScore(news, sentimentScores);

    // Determine sentiment trend
    const sentimentTrend = this.calculateSentimentTrend(sentimentScores);

    // Determine risk level
    const normalizedRisk = riskScore / news.length;
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (normalizedRisk > 0.5) riskLevel = 'high';
    else if (normalizedRisk > 0.2) riskLevel = 'medium';

    return {
      symbol,
      overallSentiment: {
        score: avgScore,
        label: avgScore > 0.1 ? 'bullish' : avgScore < -0.1 ? 'bearish' : 'neutral',
        confidence: Math.min(Math.abs(avgScore) * 2, 1),
      },
      newsCount: news.length,
      recentNewsScore,
      sentimentTrend,
      keyTopics: Array.from(keyTopicsSet).slice(0, 10),
      riskLevel,
      timestamp: new Date(),
    };
  }

  private calculateTextSentiment(text: string): number {
    let positiveCount = 0;
    let negativeCount = 0;
    const words = text.toLowerCase().split(/\s+/);
    const matchedKeywords = new Set<string>(); // Prevent double counting

    for (const word of words) {
      // Check positive keywords (use word boundaries for accuracy)
      for (const kw of this.positiveKeywords) {
        if (word.includes(kw) && !matchedKeywords.has(word)) {
          positiveCount++;
          matchedKeywords.add(word);
          break; // Only count once per word
        }
      }

      // Check negative keywords (mutually exclusive with positive)
      if (!matchedKeywords.has(word)) {
        for (const kw of this.negativeKeywords) {
          if (word.includes(kw)) {
            negativeCount++;
            matchedKeywords.add(word);
            break;
          }
        }
      }
    }

    // Calculate score based on ratio of positive to negative
    const totalMatches = positiveCount + negativeCount;
    if (totalMatches === 0) return 0;

    // Score = (positive - negative) / total, weighted by match density
    const rawScore = (positiveCount - negativeCount) / totalMatches;
    const densityFactor = Math.min(totalMatches / 10, 1); // More matches = more confident

    return Math.max(-1, Math.min(1, rawScore * densityFactor));
  }

  private calculateRiskScore(text: string): number {
    let riskScore = 0;

    for (const keyword of this.riskKeywords) {
      if (text.includes(keyword)) {
        riskScore += 0.2;
      }
    }

    return Math.min(riskScore, 1);
  }

  private extractTopics(text: string): string[] {
    const topics: string[] = [];
    const topicKeywords = [
      'earnings', 'revenue', 'guidance', 'merger', 'acquisition',
      'dividend', 'buyback', 'ipo', 'split', 'offering',
      'fda', 'approval', 'trial', 'patent', 'lawsuit',
    ];

    for (const topic of topicKeywords) {
      if (text.includes(topic)) {
        topics.push(topic);
      }
    }

    return topics;
  }

  private calculateRecentNewsScore(news: StockNews[], scores: number[]): number {
    const now = Date.now();
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < news.length; i++) {
      const ageHours = (now - news[i].publishedAt.getTime()) / (1000 * 60 * 60);
      const weight = Math.exp(-ageHours / 24); // Exponential decay over 24 hours
      weightedSum += scores[i] * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private calculateSentimentTrend(
    scores: number[],
  ): 'improving' | 'declining' | 'stable' {
    if (scores.length < 3) return 'stable';

    const recentAvg = scores.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const olderAvg = scores.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(scores.length - 3, 1);

    const diff = recentAvg - olderAvg;

    if (diff > 0.1) return 'improving';
    if (diff < -0.1) return 'declining';
    return 'stable';
  }
}
