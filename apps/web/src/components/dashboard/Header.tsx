'use client';

import { useState } from 'react';
import { Menu, Search, Bell, Settings, Home } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';

export function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const { toggleSidebar, setSelectedSymbol, addToWatchlist } = useStore();

  const handleGoDashboard = () => {
    setSelectedSymbol(null);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const symbol = searchQuery.trim().toUpperCase();
      setSelectedSymbol(symbol);
      addToWatchlist(symbol);
      setSearchQuery('');
    }
  };

  return (
    <header className="bg-slate-800 border-b border-slate-700 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={toggleSidebar}>
            <Menu className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoDashboard}
            className="flex items-center gap-1"
            title="대시보드로 이동"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">대시보드</span>
          </Button>
          <h1 className="text-xl font-bold text-white">미국주식 분석</h1>
        </div>

        <form onSubmit={handleSearch} className="flex-1 max-w-md mx-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="종목 검색 (예: AAPL)"
              className="w-full bg-slate-700 border border-slate-600 rounded-md pl-10 pr-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm">
            <Bell className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="sm">
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
