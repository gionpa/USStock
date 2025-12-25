'use client';

import { TrendingUp, TrendingDown, Minus, Target, ShieldAlert } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn, formatPrice, formatPercent, formatDate, getSignalColor, getSignalBgColor } from '@/lib/utils';
import type { TradingSignal } from '@/types';

interface SignalCardProps {
  signal: TradingSignal;
  showDetails?: boolean;
}

export function SignalCard({ signal, showDetails = false }: SignalCardProps) {
  const Icon = signal.type === 'buy' ? TrendingUp : signal.type === 'sell' ? TrendingDown : Minus;
  const badgeVariant = signal.type === 'buy' ? 'success' : signal.type === 'sell' ? 'danger' : 'warning';

  return (
    <Card className={cn('relative overflow-hidden', getSignalBgColor(signal.type))}>
      <div className={cn('absolute top-0 left-0 w-1 h-full', signal.type === 'buy' ? 'bg-stock-green' : signal.type === 'sell' ? 'bg-stock-red' : 'bg-stock-yellow')} />

      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', getSignalBgColor(signal.type))}>
            <Icon className={cn('w-5 h-5', getSignalColor(signal.type))} />
          </div>
          <div>
            <CardTitle>{signal.symbol}</CardTitle>
            <p className="text-slate-400 text-sm">{formatDate(signal.createdAt)}</p>
          </div>
        </div>
        <div className="text-right">
          <Badge variant={badgeVariant} className="text-sm">
            {signal.type.toUpperCase()}
          </Badge>
          <div className="mt-1">
            <span className="text-2xl font-bold text-white">{signal.strength}</span>
            <span className="text-slate-400 text-sm">%</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-slate-400 text-xs">현재가</p>
            <p className="text-white font-medium">{formatPrice(signal.price)}</p>
          </div>
          {signal.targetPrice && (
            <div>
              <p className="text-slate-400 text-xs flex items-center gap-1">
                <Target className="w-3 h-3" /> 목표가
              </p>
              <p className="text-stock-green font-medium">{formatPrice(signal.targetPrice)}</p>
            </div>
          )}
          {signal.stopLoss && (
            <div>
              <p className="text-slate-400 text-xs flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> 손절가
              </p>
              <p className="text-stock-red font-medium">{formatPrice(signal.stopLoss)}</p>
            </div>
          )}
        </div>

        {showDetails && signal.reasoning.length > 0 && (
          <div className="border-t border-slate-700 pt-4">
            <p className="text-slate-400 text-xs mb-2">시그널 근거</p>
            <div className="space-y-2">
              {signal.reasoning.slice(0, 5).map((reason, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Badge variant="default" className="text-xs shrink-0">
                    {reason.source}
                  </Badge>
                  <p className="text-slate-300 text-sm">{reason.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
