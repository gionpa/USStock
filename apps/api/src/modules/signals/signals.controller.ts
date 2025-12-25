import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Patch,
} from '@nestjs/common';
import { SignalsService, SignalSummary } from './signals.service';
import { TradingSignal } from '@/common/interfaces';

@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  getActiveSignals(): TradingSignal[] {
    return this.signalsService.getActiveSignals();
  }

  @Get('summary')
  getSignalSummary(): SignalSummary {
    return this.signalsService.getSignalSummary();
  }

  @Get('watchlist')
  async getWatchlist(): Promise<string[]> {
    return this.signalsService.getWatchlist();
  }

  @Get('watchlist/signals')
  async getWatchlistSignals(): Promise<Record<string, TradingSignal | null>> {
    const signals = await this.signalsService.getSignalsForWatchlist();
    const result: Record<string, TradingSignal | null> = {};

    signals.forEach((signal, symbol) => {
      result[symbol] = signal;
    });

    return result;
  }

  @Post('watchlist/:symbol')
  async addToWatchlist(
    @Param('symbol') symbol: string,
  ): Promise<{ added: boolean; symbol: string }> {
    const normalized = symbol.toUpperCase();
    const added = await this.signalsService.addToWatchlist(normalized);
    return { added, symbol: normalized };
  }

  @Delete('watchlist/:symbol')
  async removeFromWatchlist(
    @Param('symbol') symbol: string,
  ): Promise<{ removed: boolean; symbol: string }> {
    const normalized = symbol.toUpperCase();
    const removed = await this.signalsService.removeFromWatchlist(normalized);
    return { removed, symbol: normalized };
  }

  @Patch('watchlist/reorder')
  async reorderWatchlist(
    @Body() body: { sourceSymbol?: string; targetSymbol?: string },
  ): Promise<{ reordered: boolean; sourceSymbol: string; targetSymbol: string }> {
    const sourceSymbol = body.sourceSymbol?.toUpperCase() || '';
    const targetSymbol = body.targetSymbol?.toUpperCase() || '';
    const reordered = await this.signalsService.reorderWatchlist(
      sourceSymbol,
      targetSymbol,
    );
    return { reordered, sourceSymbol, targetSymbol };
  }

  @Get(':symbol')
  async getSignal(@Param('symbol') symbol: string): Promise<TradingSignal | null> {
    return this.signalsService.getSignalForSymbol(symbol.toUpperCase());
  }

  @Get(':symbol/history')
  getSignalHistory(
    @Param('symbol') symbol: string,
    @Query('limit') limit?: string,
  ): TradingSignal[] {
    return this.signalsService.getSignalHistory(
      symbol.toUpperCase(),
      limit ? parseInt(limit, 10) : 10,
    );
  }
}
