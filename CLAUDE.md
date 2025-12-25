# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

USStock is a real-time US stock market analysis and trading signals platform. It consists of 4 SubAgents:

1. **News Collection Agent** - Collects stock news from Polygon.io and Finnhub APIs
2. **Realtime Quote/Order Agent** - WebSocket-based real-time price and order book data
3. **Analysis Agent** - Combines news sentiment + technical indicators to generate signals
4. **UI/UX Agent** - Next.js frontend dashboard

## Build & Development Commands

```bash
# Install all dependencies (from root)
npm install

# Development
npm run dev:api          # Start NestJS API server (port 3100)
npm run dev:web          # Start Next.js frontend (port 3200)

# Build
npm run build:api        # Build API for production
npm run build:web        # Build frontend for production

# Production
npm run start:api        # Start production API
npm run start:web        # Start production frontend

# Testing
npm test                 # Run all tests

# Docker
docker-compose up        # Start all services with Docker
```

## Architecture

```
USStock/
├── apps/
│   ├── api/             # NestJS backend
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── news/        # News collection (Polygon + Finnhub)
│   │       │   ├── quotes/      # Real-time quotes (WebSocket)
│   │       │   ├── analysis/    # Technical & sentiment analysis
│   │       │   └── signals/     # Trading signal generation
│   │       └── config/          # Environment configuration
│   └── web/             # Next.js frontend
│       └── src/
│           ├── app/             # Next.js App Router
│           ├── components/      # React components
│           ├── lib/             # API clients, utilities
│           ├── store/           # Zustand state management
│           └── types/           # TypeScript interfaces
└── packages/            # Shared packages (future use)
```

## Key Patterns

- **Monorepo with npm workspaces** - Shared dependencies at root
- **Bull queues for async processing** - News and analysis jobs
- **Socket.io for real-time updates** - `/quotes` and `/signals` namespaces
- **Zustand for client state** - Lightweight state management
- **React Query for server state** - Caching and refetching

## Environment Variables

Copy `.env.example` to `.env` and configure:
- `POLYGON_API_KEY` - Polygon.io API key
- `FINNHUB_API_KEY` - Finnhub API key
- `REDIS_HOST/PORT` - Redis connection (Railway provides automatically)
- `NEXT_PUBLIC_API_URL` - Backend API URL for frontend

## Deployment

Railway deployment is configured. Each service (api, web, redis) should be deployed as separate Railway services.
