import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { AnalysisService } from './analysis.service';

@Processor('analysis-processing')
export class AnalysisProcessor {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(private readonly analysisService: AnalysisService) {}

  @Process('analyze')
  async handleAnalysis(job: Job<{ symbol: string }>) {
    const { symbol } = job.data;
    this.logger.log(`Processing analysis for ${symbol}`);

    try {
      const analysis = await this.analysisService.analyzeSymbol(symbol);

      this.logger.log(
        `Analysis complete for ${symbol}: Signal = ${analysis.signal?.type} (${analysis.signal?.strength}%)`,
      );

      return {
        symbol,
        status: 'completed',
        signal: analysis.signal,
      };
    } catch (error) {
      this.logger.error(`Analysis failed for ${symbol}`, error);
      throw error;
    }
  }
}
