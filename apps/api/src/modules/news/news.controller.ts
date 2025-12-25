import { Controller, Get, Param, Post } from '@nestjs/common';
import { NewsService } from './news.service';
import { StockNews, NewsSentiment } from '@/common/interfaces';

interface StoredNews extends StockNews {
  titleKo?: string;
  summaryKo?: string | null;
}

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  /**
   * Get market news - returns news with Korean translations if available
   * Translations are pre-computed and stored in Redis
   */
  @Get()
  async getMarketNews(): Promise<StoredNews[]> {
    return this.newsService.getMarketNews();
  }

  /**
   * Get news for specific symbol
   */
  @Get('symbol/:symbol')
  async getNewsForSymbol(@Param('symbol') symbol: string): Promise<StoredNews[]> {
    return this.newsService.getNewsForSymbol(symbol.toUpperCase());
  }

  /**
   * Get sentiment for symbol
   */
  @Get('sentiment/:symbol')
  async getSentiment(@Param('symbol') symbol: string): Promise<NewsSentiment | null> {
    return this.newsService.getSentimentForSymbol(symbol.toUpperCase());
  }

  /**
   * Get news stats
   */
  @Get('stats')
  async getStats(): Promise<{ totalNews: number }> {
    return this.newsService.getStats();
  }

  /**
   * Manually trigger news fetch and store
   */
  @Post('fetch')
  async triggerFetch(): Promise<{ saved: number; duplicates: number }> {
    return this.newsService.fetchAndStoreMarketNews();
  }

  /**
   * Manually trigger translation for untranslated news
   */
  @Post('translate')
  async triggerTranslate(): Promise<{ queued: number }> {
    return this.newsService.triggerTranslation();
  }

  /**
   * Force re-summarize latest RGTI news (Claude CLI only)
   */
  @Post('translate/rgti/latest')
  async forceTranslateLatestRgtI(): Promise<{ processed: number; newsId?: string; reason?: string }> {
    return this.newsService.forceResummarizeLatestSymbol('RGTI');
  }
}
