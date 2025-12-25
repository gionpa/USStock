import { Controller, Get, Param, Post } from '@nestjs/common';
import { AnalysisService, ComprehensiveAnalysis } from './analysis.service';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get(':symbol')
  async getAnalysis(
    @Param('symbol') symbol: string,
  ): Promise<ComprehensiveAnalysis> {
    return this.analysisService.analyzeSymbol(symbol.toUpperCase());
  }

  @Post(':symbol/queue')
  async queueAnalysis(@Param('symbol') symbol: string): Promise<{ queued: boolean }> {
    await this.analysisService.queueAnalysis(symbol.toUpperCase());
    return { queued: true };
  }
}
