'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  Target,
  ShieldAlert,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { analysisApi, quotesApi, financialsApi } from '@/lib/api';
import {
  cn,
  formatPrice,
  formatPercent,
  getTrendColor,
  getRiskColor,
} from '@/lib/utils';
import type { PriceHistoryPoint, QuarterlyFinancial } from '@/types';

interface QuoteDetailProps {
  symbol: string;
}

export function QuoteDetail({ symbol }: QuoteDetailProps) {
  const [historyRange, setHistoryRange] = useState('1m');

  const { data: analysis, isLoading, error } = useQuery({
    queryKey: ['analysis', symbol],
    queryFn: () => analysisApi.getAnalysis(symbol),
    refetchInterval: 60000,
    enabled: !!symbol,
  });

  const { data: priceHistory } = useQuery({
    queryKey: ['quote-history', symbol, historyRange],
    queryFn: () => quotesApi.getHistory(symbol, historyRange),
    refetchInterval: 300000,
    enabled: !!symbol,
  });

  const { data: financials, isLoading: isFinancialsLoading } = useQuery({
    queryKey: ['financials', symbol],
    queryFn: () => financialsApi.getQuarterlyFinancials(symbol),
    enabled: !!symbol,
  });

  const chartData = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) {
      return [];
    }

    return addTrendline(priceHistory);
  }, [priceHistory]);

  const financialItems = useMemo(() => {
    if (!financials?.items || financials.items.length === 0) {
      return [];
    }
    return [...financials.items].reverse();
  }, [financials]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="animate-pulse py-8">
          <div className="h-8 bg-slate-700 rounded w-1/3 mb-4" />
          <div className="h-12 bg-slate-700 rounded w-1/2 mb-4" />
          <div className="h-4 bg-slate-700 rounded w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (error || !analysis) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-slate-400">{symbol} 분석 데이터를 불러오지 못했습니다</p>
        </CardContent>
      </Card>
    );
  }

  const { quote, technical, sentiment, priceAction, signal } = analysis;

  return (
    <div className="space-y-4">
      {/* Price Overview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">{symbol}</CardTitle>
            <p className="text-slate-400">미국 주식</p>
          </div>
          {signal && (
            <div className="text-right">
              <Badge
                variant={signal.type === 'buy' ? 'success' : signal.type === 'sell' ? 'danger' : 'warning'}
                className="text-lg px-3 py-1"
              >
                {signal.type.toUpperCase()} ({signal.strength}%)
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-4xl font-bold text-white">
              {formatPrice(quote.price)}
            </span>
            <span className={cn('text-xl font-medium', getTrendColor(quote.changePercent))}>
              {formatPercent(quote.changePercent)}
            </span>
            <span className={cn('text-lg', getTrendColor(quote.change))}>
              ({quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)})
            </span>
          </div>

          {signal && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-slate-700/30 rounded-lg">
              {signal.targetPrice && (
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-stock-green" />
                  <span className="text-slate-400">목표가:</span>
                  <span className="text-stock-green font-medium">
                    {formatPrice(signal.targetPrice)}
                  </span>
                </div>
              )}
              {signal.stopLoss && (
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-stock-red" />
                  <span className="text-slate-400">손절가:</span>
                  <span className="text-stock-red font-medium">
                    {formatPrice(signal.stopLoss)}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Technical Analysis */}
      {technical && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              기술적 분석
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-slate-700/30 rounded-lg">
                <p className="text-slate-400 text-xs mb-1">추세</p>
                <p className={cn(
                  'font-medium capitalize',
                  technical.signals.trend === 'bullish' ? 'text-stock-green' :
                  technical.signals.trend === 'bearish' ? 'text-stock-red' : 'text-slate-300'
                )}>
                  {technical.signals.trend === 'bullish' ? '상승' : technical.signals.trend === 'bearish' ? '하락' : '중립'}
                </p>
              </div>
              <div className="p-3 bg-slate-700/30 rounded-lg">
                <p className="text-slate-400 text-xs mb-1">RSI ({technical.indicators.rsi.toFixed(1)})</p>
                <p className={cn(
                  'font-medium capitalize',
                  technical.signals.momentum === 'oversold' ? 'text-stock-green' :
                  technical.signals.momentum === 'overbought' ? 'text-stock-red' : 'text-slate-300'
                )}>
                  {technical.signals.momentum === 'oversold' ? '과매도' : technical.signals.momentum === 'overbought' ? '과매수' : '중립'}
                </p>
              </div>
              <div className="p-3 bg-slate-700/30 rounded-lg">
                <p className="text-slate-400 text-xs mb-1">변동성</p>
                <p className={cn(
                  'font-medium capitalize',
                  technical.signals.volatility === 'high' ? 'text-stock-red' :
                  technical.signals.volatility === 'low' ? 'text-stock-green' : 'text-slate-300'
                )}>
                  {technical.signals.volatility === 'high' ? '높음' : technical.signals.volatility === 'low' ? '낮음' : '보통'}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-slate-400 text-xs mb-2">이동평균</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">SMA 20:</span>
                    <span className="text-white">{formatPrice(technical.indicators.sma.sma20)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">SMA 50:</span>
                    <span className="text-white">{formatPrice(technical.indicators.sma.sma50)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">SMA 200:</span>
                    <span className="text-white">{formatPrice(technical.indicators.sma.sma200)}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-slate-400 text-xs mb-2">MACD</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">MACD:</span>
                    <span className={getTrendColor(technical.indicators.macd.macd)}>
                      {technical.indicators.macd.macd.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Signal:</span>
                    <span className="text-white">{technical.indicators.macd.signal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Histogram:</span>
                    <span className={getTrendColor(technical.indicators.macd.histogram)}>
                      {technical.indicators.macd.histogram.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sentiment Analysis */}
      {sentiment && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              감성 분석
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-slate-700/30 rounded-lg">
                <p className="text-slate-400 text-xs mb-1">전체 감성</p>
                <p className={cn(
                  'font-medium capitalize',
                  sentiment.overallSentiment.label === 'bullish' ? 'text-stock-green' :
                  sentiment.overallSentiment.label === 'bearish' ? 'text-stock-red' : 'text-slate-300'
                )}>
                  {sentiment.overallSentiment.label === 'bullish' ? '긍정적' : sentiment.overallSentiment.label === 'bearish' ? '부정적' : '중립'}
                </p>
              </div>
              <div className="p-3 bg-slate-700/30 rounded-lg">
                <p className="text-slate-400 text-xs mb-1">추세</p>
                <p className={cn(
                  'font-medium capitalize',
                  sentiment.sentimentTrend === 'improving' ? 'text-stock-green' :
                  sentiment.sentimentTrend === 'declining' ? 'text-stock-red' : 'text-slate-300'
                )}>
                  {sentiment.sentimentTrend === 'improving' ? '개선' : sentiment.sentimentTrend === 'declining' ? '악화' : '안정'}
                </p>
              </div>
              <div className="p-3 bg-slate-700/30 rounded-lg">
                <p className="text-slate-400 text-xs mb-1">위험 수준</p>
                <p className={cn('font-medium capitalize', getRiskColor(sentiment.riskLevel))}>
                  {sentiment.riskLevel === 'high' ? '높음' : sentiment.riskLevel === 'low' ? '낮음' : '보통'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">분석된 뉴스: {sentiment.newsCount}건</span>
              <span className="text-slate-400">
                점수: {(sentiment.overallSentiment.score * 100).toFixed(0)}%
              </span>
            </div>

            {sentiment.keyTopics.length > 0 && (
              <div className="mt-3">
                <p className="text-slate-400 text-xs mb-2">주요 토픽</p>
                <div className="flex flex-wrap gap-1">
                  {sentiment.keyTopics.map((topic) => (
                    <Badge key={topic} variant="default" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Price Action */}
      {priceAction && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {priceAction.priceChangePercent24h >= 0 ? (
                <TrendingUp className="w-5 h-5 text-stock-green" />
              ) : (
                <TrendingDown className="w-5 h-5 text-stock-red" />
              )}
              가격 동향
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-400 text-xs">기간 선택</p>
              <div className="flex items-center gap-2">
                {[
                  { value: '1w', label: '1주' },
                  { value: '1m', label: '1개월' },
                  { value: '3m', label: '3개월' },
                  { value: '1y', label: '1년' },
                  { value: 'max', label: '최대' },
                ].map((range) => (
                  <button
                    key={range.value}
                    onClick={() => setHistoryRange(range.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs transition-colors',
                      historyRange === range.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600',
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-56 w-full mb-6">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      scale="time"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickFormatter={(value) => formatChartDate(value, historyRange)}
                    />
                    <YAxis
                      dataKey="price"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickFormatter={(value) => formatPrice(value)}
                      width={70}
                    />
                    <Tooltip
                      labelFormatter={(value) => formatChartDate(value as number, historyRange, true)}
                      formatter={(value: number, name) => [
                        formatPrice(Number(value)),
                        name === 'price' ? '가격' : '추세선',
                      ]}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: 8,
                      }}
                      itemStyle={{ color: '#e2e8f0' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="trend"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center rounded-lg bg-slate-700/30">
                  <p className="text-slate-400 text-sm">차트 데이터를 불러오지 못했습니다</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-slate-400 text-xs mb-2">지지선</p>
                <div className="space-y-1">
                  {priceAction.supportLevels.map((level, i) => (
                    <div key={i} className="text-stock-green text-sm">
                      {formatPrice(level)}
                    </div>
                  ))}
                  {priceAction.supportLevels.length === 0 && (
                    <span className="text-slate-500 text-sm">감지된 지지선 없음</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-slate-400 text-xs mb-2">저항선</p>
                <div className="space-y-1">
                  {priceAction.resistanceLevels.map((level, i) => (
                    <div key={i} className="text-stock-red text-sm">
                      {formatPrice(level)}
                    </div>
                  ))}
                  {priceAction.resistanceLevels.length === 0 && (
                    <span className="text-slate-500 text-sm">감지된 저항선 없음</span>
                  )}
                </div>
              </div>
            </div>

            {priceAction.patterns.length > 0 && (
              <div>
                <p className="text-slate-400 text-xs mb-2">감지된 패턴</p>
                <div className="space-y-2">
                  {priceAction.patterns.map((pattern, i) => (
                    <div key={i} className="p-2 bg-slate-700/30 rounded">
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          'font-medium',
                          pattern.type === 'bullish' ? 'text-stock-green' :
                          pattern.type === 'bearish' ? 'text-stock-red' : 'text-slate-300'
                        )}>
                          {pattern.name}
                        </span>
                        <span className="text-slate-400 text-xs">
                          신뢰도 {(pattern.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-1">{pattern.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Financial Analysis */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            재무 분석
          </CardTitle>
          <span className="text-xs text-slate-400">
            단위: 원화 백만원 (EPS는 원)
            {financials?.usdToKrw ? ` · 환율 ${financials.usdToKrw.toFixed(2)}원` : ''}
          </span>
        </CardHeader>
        <CardContent>
          {isFinancialsLoading && (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-slate-700 rounded w-1/3" />
              <div className="h-24 bg-slate-700 rounded w-full" />
            </div>
          )}
          {!isFinancialsLoading && (!financials || financialItems.length === 0) && (
            <p className="text-slate-400 text-sm">재무 데이터가 없습니다</p>
          )}
          {!isFinancialsLoading && financials && financialItems.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-[880px] w-full text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left pb-2 pr-4 sticky left-0 z-20 bg-slate-800/70 border-r border-slate-700/60">
                      지표
                    </th>
                    {financialItems.map((item) => (
                      <th key={item.period} className="text-right pb-2 px-2">
                        {item.period}
                      </th>
                    ))}
                    <th className="text-right pb-2 pl-4">QoQ</th>
                    <th className="text-right pb-2 pl-4">YoY</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {buildFinancialRows(financials?.usdToKrw).map((row) => (
                    <tr key={row.key} className="border-t border-slate-700/60">
                      <td className="py-2 pr-4 text-slate-300 sticky left-0 z-10 bg-slate-800/60 border-r border-slate-700/60">
                        {row.label}
                      </td>
                      {financialItems.map((item) => (
                        <td key={`${row.key}-${item.period}`} className="py-2 px-2 text-right">
                          {row.formatter(item)}
                        </td>
                      ))}
                      <td className="py-2 pl-4 text-right text-slate-300">
                        {formatGrowth(getMetricValue(financialItems, row.accessor, 0))}
                      </td>
                      <td className="py-2 pl-4 text-right text-slate-300">
                        {formatGrowth(getMetricValue(financialItems, row.accessor, 3))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signal Reasoning */}
      {signal && signal.reasoning.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>시그널 근거</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {signal.reasoning.map((reason, i) => (
                <div key={i} className="flex items-start gap-2 p-2 bg-slate-700/30 rounded">
                  <Badge variant="default" className="text-xs shrink-0 mt-0.5">
                    {reason.source}
                  </Badge>
                  <div className="flex-1">
                    <p className="text-slate-300 text-sm">{reason.description}</p>
                  </div>
                  <span className="text-slate-500 text-xs shrink-0">
                    +{reason.weight.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function addTrendline(points: PriceHistoryPoint[]) {
  if (points.length < 2) {
    return points.map((point) => ({ ...point, trend: point.price }));
  }

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  points.forEach((point, index) => {
    const x = index;
    const y = point.price;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });

  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return points.map((point, index) => ({
    ...point,
    trend: intercept + slope * index,
  }));
}

function formatChartDate(value: number, range: string, withYear: boolean = false) {
  const date = new Date(value);
  const includeYear = withYear || range === '1y' || range === 'max';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: includeYear ? 'numeric' : undefined,
  });
}

function buildFinancialRows(usdToKrw?: number) {
  return [
    {
      key: 'revenue',
      label: '매출액',
      accessor: (item: QuarterlyFinancial) => item.revenue,
      formatter: (item: QuarterlyFinancial) =>
        formatFinancialValue(item.revenue, false, usdToKrw),
    },
    {
      key: 'grossProfit',
      label: '매출총이익',
      accessor: (item: QuarterlyFinancial) => item.grossProfit,
      formatter: (item: QuarterlyFinancial) =>
        formatFinancialValue(item.grossProfit, false, usdToKrw),
    },
    {
      key: 'operatingIncome',
      label: '영업이익',
      accessor: (item: QuarterlyFinancial) => item.operatingIncome,
      formatter: (item: QuarterlyFinancial) =>
        formatFinancialValue(item.operatingIncome, false, usdToKrw),
    },
    {
      key: 'netIncome',
      label: '순이익',
      accessor: (item: QuarterlyFinancial) => item.netIncome,
      formatter: (item: QuarterlyFinancial) =>
        formatFinancialValue(item.netIncome, false, usdToKrw),
    },
    {
      key: 'eps',
      label: 'EPS(희석)',
      accessor: (item: QuarterlyFinancial) => item.eps,
      formatter: (item: QuarterlyFinancial) =>
        formatFinancialValue(item.eps, true, usdToKrw),
    },
    {
      key: 'operatingCashFlow',
      label: '영업현금흐름',
      accessor: (item: QuarterlyFinancial) => item.operatingCashFlow,
      formatter: (item: QuarterlyFinancial) =>
        formatFinancialValue(item.operatingCashFlow, false, usdToKrw),
    },
  ];
}

function formatFinancialValue(
  value?: number,
  isEps: boolean = false,
  usdToKrw?: number,
) {
  if (value === null || value === undefined) {
    return '-';
  }
  if (isEps) {
    return formatKrw(value, usdToKrw);
  }
  return formatKrwMillions(value, usdToKrw);
}

const DEFAULT_USD_TO_KRW = 1300;

function formatKrwMillions(value: number, usdToKrw?: number) {
  const rate = usdToKrw ?? DEFAULT_USD_TO_KRW;
  const converted = (value * rate) / 1_000_000;
  return new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 1,
  }).format(converted);
}

function formatKrw(value: number, usdToKrw?: number) {
  const rate = usdToKrw ?? DEFAULT_USD_TO_KRW;
  const converted = value * rate;
  return new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(converted);
}

function getMetricValue(
  items: QuarterlyFinancial[],
  accessor: (item: QuarterlyFinancial) => number | undefined,
  offset: number,
): { current?: number; previous?: number } {
  if (items.length === 0) {
    return {};
  }
  const latestIndex = items.length - 1;
  const current = accessor(items[latestIndex]);
  const previousIndex = latestIndex - (offset + 1);
  const previous =
    previousIndex >= 0 ? accessor(items[previousIndex]) : undefined;

  return { current, previous };
}

function formatGrowth({
  current,
  previous,
}: {
  current?: number;
  previous?: number;
}) {
  if (current === undefined || previous === undefined || previous === 0) {
    return '-';
  }
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  return formatPercent(percent);
}
