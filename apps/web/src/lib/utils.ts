import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatPercent(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  return num.toLocaleString();
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getSignalColor(type: 'buy' | 'sell' | 'hold'): string {
  switch (type) {
    case 'buy':
      return 'text-stock-green';
    case 'sell':
      return 'text-stock-red';
    case 'hold':
      return 'text-stock-yellow';
  }
}

export function getSignalBgColor(type: 'buy' | 'sell' | 'hold'): string {
  switch (type) {
    case 'buy':
      return 'bg-stock-green/20';
    case 'sell':
      return 'bg-stock-red/20';
    case 'hold':
      return 'bg-stock-yellow/20';
  }
}

export function getTrendColor(value: number): string {
  return value >= 0 ? 'text-stock-green' : 'text-stock-red';
}

export function getSentimentLabel(sentiment: 'bullish' | 'bearish' | 'neutral'): string {
  switch (sentiment) {
    case 'bullish':
      return 'Bullish';
    case 'bearish':
      return 'Bearish';
    case 'neutral':
      return 'Neutral';
  }
}

export function getRiskColor(risk: 'low' | 'medium' | 'high'): string {
  switch (risk) {
    case 'low':
      return 'text-stock-green';
    case 'medium':
      return 'text-stock-yellow';
    case 'high':
      return 'text-stock-red';
  }
}
