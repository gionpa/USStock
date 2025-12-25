# USStock 데이터 흐름 (Data Flow)

## 아키텍처 개요

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   API Server    │────▶│   Data Sources  │
│   (Next.js)     │◀────│   (NestJS)      │◀────│   (External)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌───────────────────────────────┐
        │               │        Storage Layer          │
        │               ├───────────────┬───────────────┤
        │               │    Redis      │  PostgreSQL   │
        │               │   (Cache)     │ (Persistent)  │
        │               └───────────────┴───────────────┘
        │
        ▼
┌─────────────────┐
│   Zustand       │
│   (State)       │
└─────────────────┘
```

## 주요 컴포넌트

### 1. Frontend (Next.js - Port 3200)
- **Zustand Store**: 클라이언트 상태 관리
- **WebSocket**: 실시간 시세 수신
- **REST API**: 데이터 조회/수정

### 2. API Server (NestJS - Port 3100)
- **Controllers**: REST API 엔드포인트
- **Services**: 비즈니스 로직
- **Repositories**: 데이터 접근 계층
- **WebSocket Gateway**: 실시간 데이터 브로드캐스트

### 3. Storage Layer
- **Redis (Port 6381)**: 캐시, 빠른 조회
- **PostgreSQL (Port 5434)**: 영구 저장소

### 4. External Data Sources
- **Finnhub**: 실시간 시세, 뉴스
- **Polygon.io**: 시세, 뉴스
- **Claude CLI**: 뉴스 한국어 번역

---

## 데이터 흐름 상세

### 1. 관심종목 (Watchlist)

```
[추가 흐름]
Frontend (Sidebar)
    │
    ▼ addToWatchlist(symbol)
Zustand Store
    │ [normalized, ...state.watchlist]  ← 맨 앞에 추가
    │
    ▼ POST /api/signals/watchlist/:symbol
API Server (SignalsService)
    │
    ├──▶ Redis (lpush) ← 캐시에 맨 앞 추가
    │
    └──▶ PostgreSQL (create) ← 영구 저장
         orderBy: addedAt DESC ← 최신순 조회

[조회 흐름]
Frontend
    │
    ▼ GET /api/signals/watchlist
API Server
    │
    ▼ PostgreSQL (Primary)
      SELECT * FROM watchlist
      ORDER BY added_at DESC
    │
    ▼
Frontend (Zustand setWatchlist)
```

**관련 파일:**
- `apps/web/src/store/useStore.ts` - 프론트엔드 상태
- `apps/web/src/components/dashboard/Sidebar.tsx` - UI
- `apps/api/src/modules/signals/signals.service.ts` - 서비스
- `apps/api/src/modules/signals/repositories/watchlist-pg.repository.ts` - PostgreSQL
- `apps/api/src/modules/signals/repositories/watchlist.repository.ts` - Redis

---

### 2. 뉴스 (News)

```
[수집 흐름] - 5분마다 스케줄 실행
Cron Scheduler
    │
    ▼
NewsService.fetchAndStoreMarketNews()
    │
    ├──▶ PolygonNewsService.getMarketNews()
    │
    └──▶ FinnhubNewsService.getMarketNews()
    │
    ▼ deduplicateNews() - 중복 제거
    │
    ├──▶ Redis (saveNewsBatch) ← 캐시 저장
    │
    └──▶ PostgreSQL (saveNewsBatch) ← 영구 저장
    │
    ▼ Queue: translate-batch ← 번역 작업 큐

[번역 흐름]
Bull Queue (news-processing)
    │
    ▼
TranslationService
    │
    ▼ Claude CLI (claude -p "번역...")
    │
    ├──▶ Redis (updateTranslation)
    │
    └──▶ PostgreSQL (updateTranslation)

[조회 흐름]
Frontend
    │
    ▼ GET /api/news?translate=ko
API Server (NewsController)
    │
    ▼ Redis (getMarketNews) ← 캐시 우선
    │
    ▼ (캐시 없으면) fetchAndStoreMarketNews()
    │
    ▼
Frontend (NewsFeed)
```

**관련 파일:**
- `apps/api/src/modules/news/news.service.ts` - 뉴스 서비스
- `apps/api/src/modules/news/repositories/news.repository.ts` - Redis
- `apps/api/src/modules/news/repositories/news-pg.repository.ts` - PostgreSQL
- `apps/api/src/modules/news/services/translation.service.ts` - 번역

---

### 3. 실시간 시세 (Quotes)

```
[WebSocket 연결]
Frontend
    │
    ▼ Socket.IO connect (ws://localhost:3100)
QuotesGateway
    │
    ▼ subscribe(symbols)
    │
    ├──▶ FinnhubQuotesService (WebSocket)
    │
    └──▶ PolygonQuotesService (WebSocket)

[시세 수신]
External WebSocket
    │
    ▼
QuotesService.handlePriceUpdate()
    │
    ▼
QuotesGateway.broadcastQuote()
    │
    ▼ Socket.IO emit('quote', data)
Frontend (Zustand updateQuote)
```

**관련 파일:**
- `apps/api/src/modules/quotes/quotes.gateway.ts` - WebSocket Gateway
- `apps/api/src/modules/quotes/quotes.service.ts` - 시세 서비스
- `apps/web/src/lib/socket.ts` - 클라이언트 소켓

---

### 4. 트레이딩 시그널 (Signals)

```
[시그널 생성]
SignalsService.getSignalForSymbol(symbol)
    │
    ▼
AnalysisService.analyzeSymbol(symbol)
    │
    ├──▶ 기술적 분석 (이동평균, RSI 등)
    │
    ├──▶ 뉴스 감성 분석
    │
    └──▶ 시세 데이터 분석
    │
    ▼ TradingSignal 생성
    │
    ▼ activeSignals Map에 캐시
    │
    ▼
Frontend (SignalCard)
```

**관련 파일:**
- `apps/api/src/modules/signals/signals.service.ts` - 시그널 서비스
- `apps/api/src/modules/analysis/analysis.service.ts` - 분석 서비스

---

## 데이터베이스 스키마

### PostgreSQL

```sql
-- 뉴스 테이블
CREATE TABLE news (
    id UUID PRIMARY KEY,
    external_id VARCHAR UNIQUE,
    provider VARCHAR,
    title VARCHAR,
    summary TEXT,
    url VARCHAR,
    image_url VARCHAR,
    source VARCHAR,
    symbols VARCHAR[],
    sentiment FLOAT,
    published_at TIMESTAMP,
    title_ko VARCHAR,
    summary_ko TEXT,
    translated_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- 관심종목 테이블
CREATE TABLE watchlist (
    id UUID PRIMARY KEY,
    user_id VARCHAR,
    symbol VARCHAR,
    name VARCHAR,
    added_at TIMESTAMP,
    notes TEXT,
    alert_enabled BOOLEAN,
    alert_price_min FLOAT,
    alert_price_max FLOAT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE(user_id, symbol)
);
```

### Redis 키 구조

```
news:market              # List - 마켓 뉴스 (JSON)
news:symbol:{symbol}     # List - 종목별 뉴스
news:initialized         # String - 초기화 플래그
signals:watchlist        # List - 관심종목 심볼 리스트
signals:watchlist:initialized  # String - 초기화 플래그
```

---

## API 엔드포인트

### 뉴스
- `GET /api/news` - 마켓 뉴스 조회
- `GET /api/news/symbol/:symbol` - 종목별 뉴스
- `POST /api/news/fetch` - 뉴스 수동 수집
- `POST /api/news/translate` - 번역 트리거

### 시세
- `GET /api/quotes/:symbol` - 종목 시세
- `GET /api/quotes/history/:symbol` - 시세 히스토리

### 시그널
- `GET /api/signals/watchlist` - 관심종목 목록
- `POST /api/signals/watchlist/:symbol` - 관심종목 추가
- `DELETE /api/signals/watchlist/:symbol` - 관심종목 삭제
- `PATCH /api/signals/watchlist/reorder` - 순서 변경
- `GET /api/signals/:symbol` - 종목 시그널

### 분석
- `GET /api/analysis/:symbol` - 종목 분석

---

## 환경 설정

```bash
# API Server
DATABASE_URL=postgresql://usstock:usstock123@localhost:5434/usstock
REDIS_HOST=localhost
REDIS_PORT=6381
FINNHUB_API_KEY=xxx
POLYGON_API_KEY=xxx

# Containers
PostgreSQL: localhost:5434
Redis: localhost:6381
```
