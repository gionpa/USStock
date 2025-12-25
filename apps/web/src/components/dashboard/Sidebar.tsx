'use client';

import { useState, useRef, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Minus, Search, Plus } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn, formatPrice, formatPercent, getTrendColor } from '@/lib/utils';
import { searchStocks, type StockInfo } from '@/lib/stockData';

export function Sidebar() {
  const {
    isSidebarOpen,
    watchlist,
    quotes,
    signals,
    selectedSymbol,
    setSelectedSymbol,
    removeFromWatchlist,
    addToWatchlist,
    moveWatchlistSymbol,
  } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [draggingSymbol, setDraggingSymbol] = useState<string | null>(null);
  const [dragOverSymbol, setDragOverSymbol] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Handle search input change
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const results = searchStocks(searchQuery, 8);
      // Filter out stocks already in watchlist
      const filteredResults = results.filter(
        (stock) => !watchlist.includes(stock.symbol)
      );
      setSearchResults(filteredResults);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, watchlist]);

  // Handle click outside to close search results
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchFocused(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Add stock to watchlist
  const handleAddStock = (stock: StockInfo) => {
    addToWatchlist(stock.symbol);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchFocused(false);
  };

  const handleDragStart = (symbol: string) => (event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', symbol);
    setDraggingSymbol(symbol);
  };

  const handleDragOver = (symbol: string) => (event: React.DragEvent) => {
    event.preventDefault();
    if (dragOverSymbol !== symbol) {
      setDragOverSymbol(symbol);
    }
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (symbol: string) => (event: React.DragEvent) => {
    event.preventDefault();
    const sourceSymbol = event.dataTransfer.getData('text/plain') || draggingSymbol;
    if (sourceSymbol && sourceSymbol !== symbol) {
      moveWatchlistSymbol(sourceSymbol, symbol);
    }
    setDraggingSymbol(null);
    setDragOverSymbol(null);
  };

  const handleDragLeave = (symbol: string) => () => {
    if (dragOverSymbol === symbol) {
      setDragOverSymbol(null);
    }
  };

  const handleDragEnd = () => {
    setDraggingSymbol(null);
    setDragOverSymbol(null);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearchQuery('');
      setSearchResults([]);
      setIsSearchFocused(false);
      searchInputRef.current?.blur();
    } else if (e.key === 'Enter' && searchResults.length > 0) {
      handleAddStock(searchResults[0]);
    }
  };

  if (!isSidebarOpen) return null;

  const showSearchResults = isSearchFocused && searchResults.length > 0;

  return (
    <aside className="w-72 bg-slate-800 border-r border-slate-700 flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-3">관심 종목</h2>

        {/* Search Input */}
        <div ref={searchContainerRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={handleKeyDown}
              placeholder="종목 검색 (예: AAPL, Apple)"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Search Results Dropdown */}
          {showSearchResults && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
              {searchResults.map((stock) => (
                <button
                  key={stock.symbol}
                  onClick={() => handleAddStock(stock)}
                  className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-slate-600 transition-colors text-left first:rounded-t-lg last:rounded-b-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{stock.symbol}</span>
                      {stock.sector && (
                        <span className="text-xs px-1.5 py-0.5 bg-slate-600 text-slate-300 rounded">
                          {stock.sector}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 truncate">{stock.name}</p>
                  </div>
                  <Plus className="w-5 h-5 text-blue-400 flex-shrink-0 ml-2" />
                </button>
              ))}
            </div>
          )}

          {/* No Results Message */}
          {isSearchFocused && searchQuery.trim().length > 0 && searchResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-xl z-50 px-4 py-3">
              <p className="text-sm text-slate-400 text-center">
                검색 결과가 없습니다
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Watchlist */}
      <div className="flex-1 overflow-y-auto">
        {watchlist.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-slate-400 text-sm">
              관심 종목이 없습니다.
              <br />
              위에서 종목을 검색하여 추가하세요.
            </p>
          </div>
        ) : (
          watchlist.map((symbol) => {
            const quote = quotes[symbol];
            const signal = signals[symbol];
            const isSelected = selectedSymbol === symbol;
            const isDragging = draggingSymbol === symbol;
            const isDragOver = dragOverSymbol === symbol;

            return (
              <div
                key={symbol}
                className={cn(
                  'px-4 py-3 border-b border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors',
                  isSelected && 'bg-slate-700',
                  isDragging && 'opacity-60',
                  isDragOver && 'bg-slate-700/80',
                )}
                onClick={() => setSelectedSymbol(symbol)}
                draggable
                onDragStart={handleDragStart(symbol)}
                onDragOver={handleDragOver(symbol)}
                onDrop={handleDrop(symbol)}
                onDragLeave={handleDragLeave(symbol)}
                onDragEnd={handleDragEnd}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{symbol}</span>
                      {signal && (
                        <SignalIndicator type={signal.type} />
                      )}
                    </div>
                    {quote ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-white">{formatPrice(quote.price)}</span>
                        <span className={cn('text-sm', getTrendColor(quote.changePercent))}>
                          {formatPercent(quote.changePercent)}
                        </span>
                      </div>
                    ) : (
                      <div className="text-slate-400 text-sm mt-1">로딩 중...</div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`${symbol}을(를) 관심 종목에서 삭제하시겠습니까?`)) {
                        removeFromWatchlist(symbol);
                      }
                    }}
                    className="p-1 hover:bg-slate-600 rounded"
                    title="관심 종목에서 제거"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Watchlist Count Footer */}
      <div className="px-4 py-2 border-t border-slate-700 bg-slate-800/50">
        <p className="text-xs text-slate-500 text-center">
          {watchlist.length}개 종목 관심 중
        </p>
      </div>
    </aside>
  );
}

function SignalIndicator({ type }: { type: 'buy' | 'sell' | 'hold' }) {
  const Icon = type === 'buy' ? TrendingUp : type === 'sell' ? TrendingDown : Minus;
  const color = type === 'buy' ? 'text-stock-green' : type === 'sell' ? 'text-stock-red' : 'text-stock-yellow';

  return <Icon className={cn('w-4 h-4', color)} />;
}
