import { Controller, Get, Param, Query } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { StockQuote, StockPriceHistoryPoint } from '@/common/interfaces';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get(':symbol')
  async getQuote(@Param('symbol') symbol: string): Promise<StockQuote | null> {
    return this.quotesService.getQuote(symbol.toUpperCase());
  }

  @Get()
  async getQuotes(
    @Query('symbols') symbols: string,
  ): Promise<Record<string, StockQuote | null>> {
    const symbolList = symbols.split(',').map((s) => s.trim().toUpperCase());
    const quotes = await this.quotesService.getQuotes(symbolList);

    const result: Record<string, StockQuote | null> = {};
    quotes.forEach((quote, symbol) => {
      result[symbol] = quote;
    });

    return result;
  }

  @Get('subscribed/list')
  getSubscribedSymbols(): string[] {
    return this.quotesService.getSubscribedSymbols();
  }

  @Get('history/:symbol')
  async getHistory(
    @Param('symbol') symbol: string,
    @Query('range') range?: string,
  ): Promise<StockPriceHistoryPoint[]> {
    return this.quotesService.getHistory(symbol.toUpperCase(), range || '1m');
  }
}
