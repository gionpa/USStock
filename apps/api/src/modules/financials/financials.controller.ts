import { Controller, Get, Param } from '@nestjs/common';
import { FinancialsService, FinancialsResponse } from './financials.service';

@Controller('financials')
export class FinancialsController {
  constructor(private readonly financialsService: FinancialsService) {}

  @Get(':symbol')
  async getFinancials(
    @Param('symbol') symbol: string,
  ): Promise<FinancialsResponse> {
    return this.financialsService.getQuarterlyFinancials(symbol.toUpperCase());
  }
}
