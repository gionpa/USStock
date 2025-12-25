import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { StockNews } from '@/common/interfaces';

interface PolygonNewsResponse {
  results: PolygonNewsItem[];
  status: string;
  count: number;
  next_url?: string;
}

interface PolygonNewsItem {
  id: string;
  title: string;
  description: string;
  article_url: string;
  published_utc: string;
  tickers: string[];
  publisher: {
    name: string;
    homepage_url: string;
  };
  keywords?: string[];
}

@Injectable()
export class PolygonNewsService {
  private readonly logger = new Logger(PolygonNewsService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get<string>('polygon.baseUrl')!;
    this.apiKey = this.configService.get<string>('polygon.apiKey')!;
  }

  async getTickerNews(
    ticker: string,
    limit: number = 10,
  ): Promise<StockNews[]> {
    try {
      const url = `${this.baseUrl}/v2/reference/news`;
      const response = await firstValueFrom(
        this.httpService.get<PolygonNewsResponse>(url, {
          params: {
            ticker,
            limit,
            apiKey: this.apiKey,
          },
        }),
      );

      return this.mapToStockNews(response.data.results);
    } catch (error) {
      this.logger.error(
        `Failed to fetch news for ${ticker} from Polygon`,
        error,
      );
      return [];
    }
  }

  async getMarketNews(limit: number = 50): Promise<StockNews[]> {
    try {
      const url = `${this.baseUrl}/v2/reference/news`;
      const response = await firstValueFrom(
        this.httpService.get<PolygonNewsResponse>(url, {
          params: {
            limit,
            apiKey: this.apiKey,
          },
        }),
      );

      return this.mapToStockNews(response.data.results);
    } catch (error) {
      this.logger.error('Failed to fetch market news from Polygon', error);
      return [];
    }
  }

  private mapToStockNews(items: PolygonNewsItem[]): StockNews[] {
    return items.map((item) => ({
      id: `polygon_${item.id}`,
      title: item.title,
      summary: item.description || '',
      source: item.publisher?.name || 'Polygon',
      url: item.article_url,
      symbols: item.tickers || [],
      publishedAt: new Date(item.published_utc),
      keywords: item.keywords,
    }));
  }
}
