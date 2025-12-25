'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { signalsApi } from '@/lib/api';

export function SignalSummary() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['signal-summary'],
    queryFn: signalsApi.getSignalSummary,
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="animate-pulse">
          <div className="h-24 bg-slate-700 rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          시그널 요약
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-stock-green/10 rounded-lg">
            <TrendingUp className="w-6 h-6 text-stock-green mx-auto mb-1" />
            <p className="text-2xl font-bold text-stock-green">{summary.buySignals}</p>
            <p className="text-slate-400 text-sm">매수 시그널</p>
          </div>
          <div className="text-center p-3 bg-stock-red/10 rounded-lg">
            <TrendingDown className="w-6 h-6 text-stock-red mx-auto mb-1" />
            <p className="text-2xl font-bold text-stock-red">{summary.sellSignals}</p>
            <p className="text-slate-400 text-sm">매도 시그널</p>
          </div>
          <div className="text-center p-3 bg-slate-700/50 rounded-lg">
            <Activity className="w-6 h-6 text-slate-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white">{summary.holdSignals}</p>
            <p className="text-slate-400 text-sm">보유 시그널</p>
          </div>
        </div>

        {summary.strongBuySignals.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-slate-400 mb-2">강력 매수 시그널</p>
            <div className="flex flex-wrap gap-2">
              {summary.strongBuySignals.slice(0, 5).map((signal) => (
                <span
                  key={signal.id}
                  className="px-2 py-1 bg-stock-green/20 text-stock-green rounded text-sm"
                >
                  {signal.symbol} ({signal.strength}%)
                </span>
              ))}
            </div>
          </div>
        )}

        {summary.strongSellSignals.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-slate-400 mb-2">강력 매도 시그널</p>
            <div className="flex flex-wrap gap-2">
              {summary.strongSellSignals.slice(0, 5).map((signal) => (
                <span
                  key={signal.id}
                  className="px-2 py-1 bg-stock-red/20 text-stock-red rounded text-sm"
                >
                  {signal.symbol} ({signal.strength}%)
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
