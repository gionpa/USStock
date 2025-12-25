import { create } from 'zustand';
import type { StockQuote, TradingSignal } from '@/types';
import { signalsApi } from '@/lib/api';

interface StoreState {
  // Watchlist
  watchlist: string[];
  setWatchlist: (symbols: string[]) => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  moveWatchlistSymbol: (sourceSymbol: string, targetSymbol: string) => void;

  // Selected symbol
  selectedSymbol: string | null;
  setSelectedSymbol: (symbol: string | null) => void;

  // Real-time quotes cache
  quotes: Record<string, StockQuote>;
  updateQuote: (symbol: string, quote: Partial<StockQuote>) => void;

  // Active signals cache
  signals: Record<string, TradingSignal | null>;
  updateSignal: (symbol: string, signal: TradingSignal | null) => void;

  // UI state
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useStore = create<StoreState>((set) => ({
  // Watchlist
  watchlist: ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META', 'AMZN', 'AMD'],
  setWatchlist: (symbols) =>
    set({
      watchlist: Array.from(
        new Set(symbols.map((symbol) => symbol.toUpperCase())),
      ),
    }),
  addToWatchlist: (symbol) =>
    set((state) => {
      const normalized = symbol.toUpperCase();
      const next = state.watchlist.includes(normalized)
        ? state.watchlist
        : [normalized, ...state.watchlist];
      void signalsApi.addToWatchlist(normalized).catch(() => {
        set((current) => ({
          watchlist: current.watchlist.filter((item) => item !== normalized),
        }));
      });
      return { watchlist: next };
    }),
  removeFromWatchlist: (symbol) =>
    set((state) => {
      const normalized = symbol.toUpperCase();
      const next = state.watchlist.filter((s) => s !== normalized);
      void signalsApi.removeFromWatchlist(normalized).catch(() => {
        set((current) => ({
          watchlist: current.watchlist.includes(normalized)
            ? current.watchlist
            : [...current.watchlist, normalized],
        }));
      });
      return { watchlist: next };
    }),
  moveWatchlistSymbol: (sourceSymbol, targetSymbol) =>
    set((state) => {
      const normalizedSource = sourceSymbol.toUpperCase();
      const normalizedTarget = targetSymbol.toUpperCase();
      const sourceIndex = state.watchlist.indexOf(normalizedSource);
      const targetIndex = state.watchlist.indexOf(normalizedTarget);

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return state;
      }

      const next = [...state.watchlist];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);

      void signalsApi.reorderWatchlist(normalizedSource, normalizedTarget);
      return { watchlist: next };
    }),

  // Selected symbol
  selectedSymbol: null,
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  // Real-time quotes
  quotes: {},
  updateQuote: (symbol, quote) =>
    set((state) => ({
      quotes: {
        ...state.quotes,
        [symbol]: {
          ...state.quotes[symbol],
          ...quote,
          symbol,
        } as StockQuote,
      },
    })),

  // Active signals
  signals: {},
  updateSignal: (symbol, signal) =>
    set((state) => ({
      signals: {
        ...state.signals,
        [symbol]: signal,
      },
    })),

  // UI state
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
