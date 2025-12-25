import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface FinnhubFinancialReportLine {
  concept?: string;
  label?: string;
  value?: number;
  unit?: string;
}

interface FinnhubFinancialReport {
  ic?: FinnhubFinancialReportLine[];
  cf?: FinnhubFinancialReportLine[];
  bs?: FinnhubFinancialReportLine[];
}

interface FinnhubFinancialReportItem {
  year: number;
  quarter: number;
  endDate?: string;
  report?: FinnhubFinancialReport;
}

interface FinnhubFinancialsResponse {
  data?: FinnhubFinancialReportItem[];
}

interface ExchangeRateResponse {
  rates?: Record<string, number>;
  time_last_update_utc?: string;
}

export interface QuarterlyFinancial {
  period: string;
  endDate?: string;
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  eps?: number;
  operatingCashFlow?: number;
}

export interface FinancialsResponse {
  symbol: string;
  currency?: string;
  usdToKrw: number;
  rateAsOf?: string;
  items: QuarterlyFinancial[];
  source: 'finnhub';
}

@Injectable()
export class FinancialsService {
  private readonly logger = new Logger(FinancialsService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fxBaseUrl = 'https://open.er-api.com/v6/latest/USD';
  private readonly fxCacheTtlMs = 10 * 60 * 1000;
  private readonly fxDefaultRate = 1300;
  private fxCache: { rate: number; fetchedAt: number; asOf?: string } | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get<string>('finnhub.baseUrl')!;
    this.apiKey = this.configService.get<string>('finnhub.apiKey') || '';
  }

  async getQuarterlyFinancials(symbol: string): Promise<FinancialsResponse> {
    if (!this.apiKey) {
      this.logger.warn('Finnhub API key not configured - financials disabled');
      return { symbol, usdToKrw: this.fxDefaultRate, items: [], source: 'finnhub' };
    }

    try {
      const { rate: usdToKrw, asOf: rateAsOf } = await this.getUsdToKrwRate();
      const url = `${this.baseUrl}/stock/financials-reported`;
      const response = await firstValueFrom(
        this.httpService.get<FinnhubFinancialsResponse>(url, {
          params: {
            symbol,
            token: this.apiKey,
            freq: 'quarterly',
          },
        }),
      );

      const reports = Array.isArray(response.data?.data) ? response.data!.data! : [];
      if (reports.length === 0) {
        return { symbol, usdToKrw, rateAsOf, items: [], source: 'finnhub' };
      }

      const sorted = reports
        .filter((report) => report.report && report.quarter > 0)
        .sort((a, b) => {
          if (a.year !== b.year) {
            return b.year - a.year;
          }
          return b.quarter - a.quarter;
        })
        .slice(0, 12);

      let currency: string | undefined;
      const items = sorted.map((report) => {
        const income = report.report?.ic ?? [];
        const cashflow = report.report?.cf ?? [];

        const revenueLine = this.findLine(income, [
          /revenuefromcontractwithcustomerexcludingassessedtax/i,
          /salesrevenuenet/i,
          /totalrevenue/i,
          /revenues/i,
        ]);
        const grossProfitLine = this.findLine(income, [/grossprofit/i]);
        const operatingIncomeLine = this.findLine(income, [/operatingincomeloss/i]);
        const netIncomeLine = this.findLine(income, [
          /netincomeloss/i,
          /profitloss/i,
        ]);
        const epsLine = this.findLine(income, [/earningspersharediluted/i]);
        const operatingCashFlowLine = this.findLine(cashflow, [
          /netcashprovidedbyusedinoperatingactivities/i,
        ]);

        currency =
          currency ||
          revenueLine?.unit ||
          grossProfitLine?.unit ||
          operatingIncomeLine?.unit ||
          netIncomeLine?.unit ||
          operatingCashFlowLine?.unit;

        return {
          period: `${report.year} Q${report.quarter}`,
          endDate: report.endDate,
          revenue: revenueLine?.value,
          grossProfit: grossProfitLine?.value,
          operatingIncome: operatingIncomeLine?.value,
          netIncome: netIncomeLine?.value,
          eps: epsLine?.value,
          operatingCashFlow: operatingCashFlowLine?.value,
        };
      });

      return { symbol, currency, usdToKrw, rateAsOf, items, source: 'finnhub' };
    } catch (error) {
      this.logger.error(`Failed to fetch financials for ${symbol}`, error);
      return { symbol, usdToKrw: this.fxDefaultRate, items: [], source: 'finnhub' };
    }
  }

  private findLine(
    lines: FinnhubFinancialReportLine[],
    matchers: RegExp[],
  ): FinnhubFinancialReportLine | undefined {
    return lines.find((line) => {
      const concept = line.concept?.toLowerCase() || '';
      const label = line.label?.toLowerCase() || '';
      return matchers.some(
        (matcher) => matcher.test(concept) || matcher.test(label),
      );
    });
  }

  private async getUsdToKrwRate(): Promise<{ rate: number; asOf?: string }> {
    const now = Date.now();
    if (this.fxCache && now - this.fxCache.fetchedAt < this.fxCacheTtlMs) {
      return { rate: this.fxCache.rate, asOf: this.fxCache.asOf };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<ExchangeRateResponse>(this.fxBaseUrl),
      );
      const rate = response.data?.rates?.KRW;

      if (typeof rate === 'number' && rate > 0) {
        this.fxCache = {
          rate,
          fetchedAt: now,
          asOf: response.data?.time_last_update_utc,
        };
        return { rate, asOf: response.data?.time_last_update_utc };
      }
    } catch (error) {
      this.logger.error('Failed to fetch USD/KRW exchange rate', error);
    }

    const fallback = this.fxCache?.rate ?? this.fxDefaultRate;
    return { rate: fallback, asOf: this.fxCache?.asOf };
  }
}
