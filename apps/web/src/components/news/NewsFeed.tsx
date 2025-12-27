'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Clock, Languages } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { newsApi } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import type { StockNews } from '@/types';

interface NewsFeedProps {
  symbol?: string;
}

export function NewsFeed({ symbol }: NewsFeedProps) {
  // Fetch news - Korean translations are pre-computed and included in response
  const { data: news, isLoading } = useQuery({
    queryKey: ['news', symbol],
    queryFn: () => (symbol ? newsApi.getNewsForSymbol(symbol) : newsApi.getMarketNews()),
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="w-5 h-5" />
            최신 뉴스
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-700 rounded w-1/2" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="w-5 h-5" />
          {symbol ? `${symbol} 뉴스` : '시장 뉴스'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-[500px] overflow-y-auto">
          {news?.slice(0, 10).map((item) => (
            <NewsItem key={item.id} news={item} />
          ))}
          {(!news || news.length === 0) && (
            <p className="text-slate-400 text-center py-4">뉴스가 없습니다</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NewsItem({ news }: { news: StockNews }) {
  const sentimentVariant =
    news.sentiment?.label === 'bullish' ? 'success' :
    news.sentiment?.label === 'bearish' ? 'danger' : 'default';

  const sentimentLabel =
    news.sentiment?.label === 'bullish' ? '긍정적' :
    news.sentiment?.label === 'bearish' ? '부정적' : '중립';

  // Use Korean translation if available
  const title = news.titleKo || news.title;
  const summary = news.summaryKo || news.summary;

  // Show indicator if Korean translation is available
  const hasKoreanTranslation = !!news.titleKo;

  return (
    <a
      href={news.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-white font-medium text-sm line-clamp-2 flex-1">
          {title}
          {hasKoreanTranslation && (
            <span className="ml-1 text-xs text-blue-400">🇰🇷</span>
          )}
        </h4>
        <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
      </div>

      {summary && (
        <p className="text-slate-400 text-sm mt-2 leading-relaxed whitespace-pre-line break-words">
          {summary}
        </p>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-slate-500 text-xs flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDate(news.publishedAt)}
        </span>
        <span className="text-slate-500 text-xs">|</span>
        <span className="text-slate-400 text-xs">{news.source}</span>

        {news.sentiment && (
          <Badge variant={sentimentVariant} className="text-xs">
            {sentimentLabel}
          </Badge>
        )}

        {news.symbols.slice(0, 3).map((symbol) => (
          <Badge key={symbol} variant="default" className="text-xs">
            {symbol}
          </Badge>
        ))}
      </div>
    </a>
  );
}
