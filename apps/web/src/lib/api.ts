import axios from 'axios';
import type {
  StockQuote,
  StockNews,
  TradingSignal,
  ComprehensiveAnalysis,
  SignalSummary,
  NewsSentiment,
  PriceHistoryPoint,
  FinancialsResponse,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 30000,
});

// Quotes API
export const quotesApi = {
  getQuote: async (symbol: string): Promise<StockQuote | null> => {
    const { data } = await api.get(`/quotes/${symbol}`);
    return data;
  },

  getQuotes: async (symbols: string[]): Promise<Record<string, StockQuote | null>> => {
    const { data } = await api.get('/quotes', {
      params: { symbols: symbols.join(',') },
    });
    return data;
  },

  getHistory: async (
    symbol: string,
    range: string,
  ): Promise<PriceHistoryPoint[]> => {
    const { data } = await api.get(`/quotes/history/${symbol}`, {
      params: { range },
    });
    return data;
  },
};

export const financialsApi = {
  getQuarterlyFinancials: async (symbol: string): Promise<FinancialsResponse> => {
    const { data } = await api.get(`/financials/${symbol}`);
    return data;
  },
};

// News API
// Translations are now pre-computed and stored in Redis
// titleKo and summaryKo are included in the response when available
export const newsApi = {
  getMarketNews: async (): Promise<StockNews[]> => {
    const { data } = await api.get('/news');
    return data;
  },

  getNewsForSymbol: async (symbol: string): Promise<StockNews[]> => {
    const { data } = await api.get(`/news/symbol/${symbol}`);
    return data;
  },

  getSentiment: async (symbol: string): Promise<NewsSentiment | null> => {
    const { data } = await api.get(`/news/sentiment/${symbol}`);
    return data;
  },

  getStats: async (): Promise<{ totalNews: number }> => {
    const { data } = await api.get('/news/stats');
    return data;
  },

  // Manually trigger news fetch (for admin purposes)
  triggerFetch: async (): Promise<{ saved: number; duplicates: number }> => {
    const { data } = await api.post('/news/fetch');
    return data;
  },
};

// Analysis API
export const analysisApi = {
  getAnalysis: async (symbol: string): Promise<ComprehensiveAnalysis> => {
    const { data } = await api.get(`/analysis/${symbol}`);
    return data;
  },

  queueAnalysis: async (symbol: string): Promise<{ queued: boolean }> => {
    const { data } = await api.post(`/analysis/${symbol}/queue`);
    return data;
  },
};

// Signals API
export const signalsApi = {
  getActiveSignals: async (): Promise<TradingSignal[]> => {
    const { data } = await api.get('/signals');
    return data;
  },

  getSignalSummary: async (): Promise<SignalSummary> => {
    const { data } = await api.get('/signals/summary');
    return data;
  },

  getSignal: async (symbol: string): Promise<TradingSignal | null> => {
    const { data } = await api.get(`/signals/${symbol}`);
    return data;
  },

  getSignalHistory: async (
    symbol: string,
    limit?: number,
  ): Promise<TradingSignal[]> => {
    const { data } = await api.get(`/signals/${symbol}/history`, {
      params: { limit },
    });
    return data;
  },

  getWatchlist: async (): Promise<string[]> => {
    const { data } = await api.get('/signals/watchlist');
    return data;
  },

  reorderWatchlist: async (
    sourceSymbol: string,
    targetSymbol: string,
  ): Promise<{ reordered: boolean; sourceSymbol: string; targetSymbol: string }> => {
    const { data } = await api.patch('/signals/watchlist/reorder', {
      sourceSymbol,
      targetSymbol,
    });
    return data;
  },

  getWatchlistSignals: async (): Promise<Record<string, TradingSignal | null>> => {
    const { data } = await api.get('/signals/watchlist/signals');
    return data;
  },

  addToWatchlist: async (symbol: string): Promise<{ added: boolean; symbol: string }> => {
    const { data } = await api.post(`/signals/watchlist/${symbol}`);
    return data;
  },

  removeFromWatchlist: async (
    symbol: string,
  ): Promise<{ removed: boolean; symbol: string }> => {
    const { data } = await api.delete(`/signals/watchlist/${symbol}`);
    return data;
  },
};

export default api;
