import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { StockNews, NewsSentiment } from '@/common/interfaces';
import { News } from '@prisma/client';

interface StoredNews extends StockNews {
  imageUrl?: string;
  titleKo?: string;
  summaryKo?: string | null;
  translatedAt?: string;
}

@Injectable()
export class NewsPgRepository {
  private readonly logger = new Logger(NewsPgRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if news already exists by external ID
   */
  async isDuplicate(externalId: string): Promise<boolean> {
    const count = await this.prisma.news.count({
      where: { externalId },
    });
    return count > 0;
  }

  /**
   * Save news item to PostgreSQL
   */
  async saveNews(news: StoredNews): Promise<News | null> {
    try {
      const existing = await this.prisma.news.findUnique({
        where: { externalId: news.id },
      });

      if (existing) {
        this.logger.debug(`News already exists: ${news.title.substring(0, 50)}...`);
        return existing;
      }

      const saved = await this.prisma.news.create({
        data: {
          externalId: news.id,
          provider: news.source.includes('polygon') ? 'polygon' : 'finnhub',
          title: news.title,
          summary: news.summary || null,
          url: news.url,
          imageUrl: news.imageUrl || null,
          source: news.source,
          symbols: news.symbols,
          sentiment: news.sentiment?.score || null,
          publishedAt: news.publishedAt,
          titleKo: news.titleKo || null,
          summaryKo: news.summaryKo || null,
          translatedAt: news.translatedAt ? new Date(news.translatedAt) : null,
        },
      });

      this.logger.debug(`Saved news: ${saved.id} - ${news.title.substring(0, 50)}...`);
      return saved;
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Unique constraint violation - already exists
        this.logger.debug(`News already exists (constraint): ${news.id}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Save batch of news items
   */
  async saveNewsBatch(newsItems: StoredNews[]): Promise<{ saved: number; duplicates: number }> {
    let saved = 0;
    let duplicates = 0;

    for (const news of newsItems) {
      const result = await this.saveNews(news);
      if (result) {
        saved++;
      } else {
        duplicates++;
      }
    }

    this.logger.log(`Batch save to PostgreSQL: ${saved} new, ${duplicates} duplicates`);
    return { saved, duplicates };
  }

  /**
   * Update news with Korean translation
   */
  async updateTranslation(
    externalId: string,
    titleKo: string,
    summaryKo?: string | null,
  ): Promise<void> {
    const news = await this.prisma.news.findUnique({
      where: { externalId },
    });

    if (!news) {
      this.logger.warn(`News not found for translation update: ${externalId}`);
      return;
    }

    await this.prisma.news.update({
      where: { externalId },
      data: {
        titleKo,
        summaryKo,
        translatedAt: new Date(),
      },
    });

    this.logger.debug(`Updated translation for: ${externalId}`);
  }

  /**
   * Get market news (sorted by publishedAt desc)
   */
  async getMarketNews(limit: number = 50): Promise<StoredNews[]> {
    const newsItems = await this.prisma.news.findMany({
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });

    return newsItems.map(this.toStoredNews);
  }

  /**
   * Get news for specific symbol
   */
  async getNewsBySymbol(symbol: string, limit: number = 30): Promise<StoredNews[]> {
    const newsItems = await this.prisma.news.findMany({
      where: {
        symbols: { has: symbol.toUpperCase() },
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });

    return newsItems.map(this.toStoredNews);
  }

  /**
   * Get news items that need translation
   */
  async getUntranslatedNews(limit: number = 20): Promise<StoredNews[]> {
    const newsItems = await this.prisma.news.findMany({
      where: {
        OR: [
          { titleKo: null },
          {
            AND: [
              { summary: { not: null } },
              { summaryKo: null },
            ],
          },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });

    return newsItems.map(this.toStoredNews);
  }

  /**
   * Get news count
   */
  async getNewsCount(): Promise<number> {
    return this.prisma.news.count();
  }

  /**
   * Clean up old news (older than 7 days)
   */
  async cleanupOldNews(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    const result = await this.prisma.news.deleteMany({
      where: {
        publishedAt: { lt: cutoffDate },
      },
    });

    this.logger.log(`Cleaned up ${result.count} old news entries`);
    return result.count;
  }

  /**
   * Convert Prisma News to StoredNews interface
   */
  private toStoredNews(news: News): StoredNews {
    return {
      id: news.externalId,
      title: news.title,
      summary: news.summary || '',
      url: news.url,
      imageUrl: news.imageUrl || undefined,
      source: news.source,
      symbols: news.symbols,
      sentiment: news.sentiment != null ? {
        score: news.sentiment,
        label: news.sentiment > 0 ? 'bullish' : news.sentiment < 0 ? 'bearish' : 'neutral',
        confidence: Math.abs(news.sentiment),
      } : undefined,
      publishedAt: news.publishedAt,
      titleKo: news.titleKo || undefined,
      summaryKo: news.summaryKo,
      translatedAt: news.translatedAt?.toISOString(),
    };
  }
}
