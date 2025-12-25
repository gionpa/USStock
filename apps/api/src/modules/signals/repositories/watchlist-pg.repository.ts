import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Watchlist } from '@prisma/client';

@Injectable()
export class WatchlistPgRepository implements OnModuleInit {
  private readonly logger = new Logger(WatchlistPgRepository.name);
  private readonly DEFAULT_USER_ID = 'default';
  private readonly defaultWatchlist = [
    'AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META', 'AMZN', 'AMD', 'NFLX', 'DIS',
  ];

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureDefaults();
  }

  async getWatchlist(userId: string = this.DEFAULT_USER_ID): Promise<string[]> {
    const items = await this.prisma.watchlist.findMany({
      where: { userId },
      orderBy: { addedAt: 'desc' },
      select: { symbol: true },
    });

    if (items.length === 0) {
      await this.ensureDefaults();
      return [...this.defaultWatchlist];
    }

    return items.map(item => item.symbol);
  }

  async addSymbol(symbol: string, userId: string = this.DEFAULT_USER_ID, name?: string): Promise<boolean> {
    const normalized = symbol.toUpperCase();

    try {
      await this.prisma.watchlist.create({
        data: {
          userId,
          symbol: normalized,
          name,
        },
      });
      this.logger.log(`Added ${normalized} to watchlist for user ${userId}`);
      return true;
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Already exists
        this.logger.debug(`Symbol ${normalized} already in watchlist`);
        return false;
      }
      throw error;
    }
  }

  async removeSymbol(symbol: string, userId: string = this.DEFAULT_USER_ID): Promise<boolean> {
    const normalized = symbol.toUpperCase();

    const result = await this.prisma.watchlist.deleteMany({
      where: {
        userId,
        symbol: normalized,
      },
    });

    if (result.count > 0) {
      this.logger.log(`Removed ${normalized} from watchlist for user ${userId}`);
      return true;
    }
    return false;
  }

  async moveSymbol(
    sourceSymbol: string,
    targetSymbol: string,
    userId: string = this.DEFAULT_USER_ID,
  ): Promise<boolean> {
    const normalizedSource = sourceSymbol.toUpperCase();
    const normalizedTarget = targetSymbol.toUpperCase();

    const sourceItem = await this.prisma.watchlist.findUnique({
      where: {
        userId_symbol: { userId, symbol: normalizedSource },
      },
    });

    const targetItem = await this.prisma.watchlist.findUnique({
      where: {
        userId_symbol: { userId, symbol: normalizedTarget },
      },
    });

    if (!sourceItem || !targetItem) {
      return false;
    }

    // Swap addedAt timestamps to change order
    await this.prisma.$transaction([
      this.prisma.watchlist.update({
        where: { id: sourceItem.id },
        data: { addedAt: targetItem.addedAt },
      }),
      this.prisma.watchlist.update({
        where: { id: targetItem.id },
        data: { addedAt: sourceItem.addedAt },
      }),
    ]);

    this.logger.log(`Moved ${normalizedSource} to position of ${normalizedTarget}`);
    return true;
  }

  async getWatchlistWithDetails(userId: string = this.DEFAULT_USER_ID): Promise<Watchlist[]> {
    return this.prisma.watchlist.findMany({
      where: { userId },
      orderBy: { addedAt: 'desc' },
    });
  }

  async updateNotes(
    symbol: string,
    notes: string,
    userId: string = this.DEFAULT_USER_ID,
  ): Promise<boolean> {
    const normalized = symbol.toUpperCase();

    const result = await this.prisma.watchlist.updateMany({
      where: { userId, symbol: normalized },
      data: { notes },
    });

    return result.count > 0;
  }

  async setAlert(
    symbol: string,
    alertEnabled: boolean,
    alertPriceMin?: number,
    alertPriceMax?: number,
    userId: string = this.DEFAULT_USER_ID,
  ): Promise<boolean> {
    const normalized = symbol.toUpperCase();

    const result = await this.prisma.watchlist.updateMany({
      where: { userId, symbol: normalized },
      data: {
        alertEnabled,
        alertPriceMin,
        alertPriceMax,
      },
    });

    return result.count > 0;
  }

  private async ensureDefaults(): Promise<void> {
    const count = await this.prisma.watchlist.count({
      where: { userId: this.DEFAULT_USER_ID },
    });

    if (count === 0) {
      this.logger.log('Initializing default watchlist');

      const now = new Date();
      const items = this.defaultWatchlist.map((symbol, index) => ({
        userId: this.DEFAULT_USER_ID,
        symbol,
        addedAt: new Date(now.getTime() + index * 1000), // Stagger timestamps for ordering
      }));

      await this.prisma.watchlist.createMany({
        data: items,
        skipDuplicates: true,
      });

      this.logger.log(`Initialized ${this.defaultWatchlist.length} default watchlist items`);
    }
  }
}
