import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { StockNews, NewsSentiment } from '@/common/interfaces';

interface FinnhubNewsItem {
  id: number;
  category: string;
  datetime: number;
  headline: string;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

interface FinnhubSentiment {
  buzz: {
    articlesInLastWeek: number;
    weeklyAverage: number;
    buzz: number;
  };
  sentiment: {
    bearishPercent: number;
    bullishPercent: number;
  };
  companyNewsScore: number;
  sectorAverageBullishPercent: number;
  sectorAverageNewsScore: number;
  symbol: string;
}

@Injectable()
export class FinnhubNewsService {
  private readonly logger = new Logger(FinnhubNewsService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get<string>('finnhub.baseUrl')!;
    this.apiKey = this.configService.get<string>('finnhub.apiKey')!;
  }

  async getCompanyNews(
    symbol: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<StockNews[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const url = `${this.baseUrl}/company-news`;
      const response = await firstValueFrom(
        this.httpService.get<FinnhubNewsItem[]>(url, {
          params: {
            symbol,
            from: fromDate || weekAgo,
            to: toDate || today,
            token: this.apiKey,
          },
        }),
      );

      return this.mapToStockNews(response.data, symbol);
    } catch (error) {
      this.logger.error(
        `Failed to fetch company news for ${symbol} from Finnhub`,
        error,
      );
      return [];
    }
  }

  async getMarketNews(category: string = 'general'): Promise<StockNews[]> {
    try {
      const url = `${this.baseUrl}/news`;
      const response = await firstValueFrom(
        this.httpService.get<FinnhubNewsItem[]>(url, {
          params: {
            category,
            token: this.apiKey,
          },
        }),
      );

      return this.mapToStockNews(response.data);
    } catch (error) {
      this.logger.error('Failed to fetch market news from Finnhub', error);
      return [];
    }
  }

  async getNewsSentiment(symbol: string): Promise<NewsSentiment | null> {
    try {
      const url = `${this.baseUrl}/news-sentiment`;
      const response = await firstValueFrom(
        this.httpService.get<FinnhubSentiment>(url, {
          params: {
            symbol,
            token: this.apiKey,
          },
        }),
      );

      const data = response.data;
      const bullish = data.sentiment?.bullishPercent || 0;
      const bearish = data.sentiment?.bearishPercent || 0;

      // Calculate sentiment score from -1 to 1
      const score = (bullish - bearish) / 100;

      return {
        score,
        label: score > 0.1 ? 'bullish' : score < -0.1 ? 'bearish' : 'neutral',
        confidence: Math.abs(score),
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch news sentiment for ${symbol} from Finnhub`,
        error,
      );
      return null;
    }
  }

  private mapToStockNews(
    items: FinnhubNewsItem[],
    symbol?: string,
  ): StockNews[] {
    return items.map((item) => ({
      id: `finnhub_${item.id}`,
      title: item.headline,
      summary: item.summary || '',
      source: item.source,
      url: item.url,
      symbols: symbol
        ? [symbol]
        : item.related
          ? item.related.split(',').map((s) => s.trim())
          : [],
      publishedAt: new Date(item.datetime * 1000),
    }));
  }
}
