'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/dashboard/Header';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { SignalSummary } from '@/components/signals/SignalSummary';
import { SignalCard } from '@/components/signals/SignalCard';
import { NewsFeed } from '@/components/news/NewsFeed';
import { QuoteDetail } from '@/components/quotes/QuoteDetail';
import { useStore } from '@/store/useStore';
import { signalsApi, quotesApi } from '@/lib/api';
import { socketManager } from '@/lib/socket';

export default function Home() {
  const { selectedSymbol, watchlist, updateQuote, updateSignal, setWatchlist } = useStore();

  const { data: serverWatchlist } = useQuery({
    queryKey: ['watchlist'],
    queryFn: signalsApi.getWatchlist,
  });

  useEffect(() => {
    if (serverWatchlist) {
      setWatchlist(serverWatchlist);
    }
  }, [serverWatchlist, setWatchlist]);

  // Fetch initial quotes for watchlist
  const { data: quotes } = useQuery({
    queryKey: ['quotes', watchlist],
    queryFn: () => quotesApi.getQuotes(watchlist),
    refetchInterval: 30000,
  });

  // Fetch signals for watchlist
  const { data: signals } = useQuery({
    queryKey: ['watchlist-signals'],
    queryFn: signalsApi.getWatchlistSignals,
    refetchInterval: 60000,
  });

  // Update store with fetched data
  useEffect(() => {
    if (quotes) {
      Object.entries(quotes).forEach(([symbol, quote]) => {
        if (quote) updateQuote(symbol, quote);
      });
    }
  }, [quotes, updateQuote]);

  useEffect(() => {
    if (signals) {
      Object.entries(signals).forEach(([symbol, signal]) => {
        updateSignal(symbol, signal);
      });
    }
  }, [signals, updateSignal]);

  // Setup WebSocket subscriptions
  useEffect(() => {
    if (watchlist.length > 0) {
      socketManager.subscribeToQuotes(watchlist);
      socketManager.subscribeToSignals(watchlist);

      const unsubQuote = socketManager.onQuoteUpdate((data) => {
        updateQuote(data.symbol, {
          price: data.price,
          timestamp: new Date(data.timestamp),
        });
      });

      const unsubSignal = socketManager.onNewSignal((signal) => {
        updateSignal(signal.symbol, signal);
      });

      return () => {
        unsubQuote();
        unsubSignal();
        socketManager.unsubscribeFromQuotes(watchlist);
        socketManager.unsubscribeFromSignals(watchlist);
      };
    }
  }, [watchlist, updateQuote, updateSignal]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-6">
          {selectedSymbol ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <QuoteDetail symbol={selectedSymbol} />
              </div>
              <div>
                <NewsFeed symbol={selectedSymbol} />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <SignalSummary />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-4">활성 시그널</h2>
                  <div className="space-y-4">
                    {signals &&
                      Object.entries(signals)
                        .filter(([_, signal]) => signal && signal.type !== 'hold')
                        .slice(0, 5)
                        .map(([symbol, signal]) => (
                          <SignalCard key={symbol} signal={signal!} showDetails />
                        ))}
                    {(!signals || Object.keys(signals).length === 0) && (
                      <p className="text-slate-400 text-center py-8">
                        활성 시그널이 없습니다. 관심 종목에서 종목을 선택하세요.
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <NewsFeed />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
