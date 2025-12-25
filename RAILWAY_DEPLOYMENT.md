# Railway 배포 가이드

이 문서는 USStock 애플리케이션을 Railway에 배포하는 방법을 설명합니다.

## 아키텍처

```
┌─────────────────┐     ┌─────────────────┐
│   Web Service   │────▶│   API Service   │
│   (Next.js)     │◀────│   (NestJS)      │
│   Port: 3000    │     │   Port: 3001    │
└─────────────────┘     └─────────────────┘
                               │
                 ┌─────────────┼─────────────┐
                 ▼             ▼             ▼
          ┌──────────┐  ┌──────────┐  ┌──────────┐
          │PostgreSQL│  │  Redis   │  │ External │
          │(Railway) │  │(Railway) │  │   APIs   │
          └──────────┘  └──────────┘  └──────────┘
```

## Railway 프로젝트 설정

### 1. 새 프로젝트 생성

1. [Railway](https://railway.app)에 로그인
2. "New Project" 클릭
3. "Empty Project" 선택

### 2. 데이터베이스 추가

#### PostgreSQL
1. "+ New" → "Database" → "PostgreSQL" 선택
2. 생성된 PostgreSQL 서비스 클릭
3. "Variables" 탭에서 `DATABASE_URL` 확인 및 복사

#### Redis
1. "+ New" → "Database" → "Redis" 선택
2. 생성된 Redis 서비스 클릭
3. "Variables" 탭에서 `REDIS_URL` 확인 및 복사

### 3. API 서비스 배포

1. "+ New" → "GitHub Repo" 선택
2. 저장소 선택 후 "apps/api" 디렉토리 지정
3. **Settings** 탭:
   - Root Directory: `apps/api`
   - Build Command: (기본값 사용 - Dockerfile)
   - Start Command: `npx prisma db push --skip-generate && node dist/main`

4. **Variables** 탭에서 환경 변수 설정:
```bash
# 자동 설정됨 (Railway Reference Variables 사용)
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# 수동 설정 필요
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://your-web-service.up.railway.app
REDIS_ENABLED=true
POLYGON_WS_ENABLED=true
FINNHUB_WS_ENABLED=true

# API Keys (실제 값 입력)
POLYGON_API_KEY=your_polygon_api_key
FINNHUB_API_KEY=your_finnhub_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 4. Web 서비스 배포

1. "+ New" → "GitHub Repo" 선택
2. 저장소 선택 후 "apps/web" 디렉토리 지정
3. **Settings** 탭:
   - Root Directory: `apps/web`
   - Build Command: (기본값 사용 - Dockerfile)

4. **Variables** 탭에서 환경 변수 설정:
```bash
# API URL (Railway Reference Variable 사용)
NEXT_PUBLIC_API_URL=${{api.RAILWAY_PUBLIC_DOMAIN}}

# 또는 직접 입력
NEXT_PUBLIC_API_URL=https://your-api-service.up.railway.app

NODE_ENV=production
PORT=3000
```

## 환경 변수 상세

### API Service 환경 변수

| 변수명 | 필수 | 설명 | 예시 |
|--------|------|------|------|
| `DATABASE_URL` | Y | PostgreSQL 연결 URL | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | Y | Redis 연결 URL | `${{Redis.REDIS_URL}}` |
| `REDIS_ENABLED` | N | Redis 사용 여부 (미설정 시 REDIS_URL 기준) | `true` |
| `PORT` | N | 서버 포트 (기본: 3001) | `3001` |
| `NODE_ENV` | N | 환경 (기본: production) | `production` |
| `CORS_ORIGIN` | N | CORS 허용 도메인 | `https://web.up.railway.app` |
| `POLYGON_API_KEY` | Y | Polygon.io API 키 | `pk_xxx` |
| `FINNHUB_API_KEY` | Y | Finnhub API 키 | `xxx` |
| `ANTHROPIC_API_KEY` | N | Claude API 키 (번역용) | `sk-ant-xxx` |
| `POLYGON_WS_ENABLED` | N | Polygon WebSocket 사용 여부 | `true` |
| `FINNHUB_WS_ENABLED` | N | Finnhub WebSocket 사용 여부 | `true` |

### Web Service 환경 변수

| 변수명 | 필수 | 설명 | 예시 |
|--------|------|------|------|
| `NEXT_PUBLIC_API_URL` | Y | API 서버 URL | `https://api.up.railway.app` |
| `PORT` | N | 서버 포트 (기본: 3000) | `3000` |
| `NODE_ENV` | N | 환경 | `production` |

## 배포 확인

### Health Check

API 서비스가 정상적으로 배포되면 다음 엔드포인트로 확인할 수 있습니다:

```bash
# 기본 헬스 체크
curl https://your-api-service.up.railway.app/api/health

# 응답 예시
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "environment": "production",
  "services": {
    "database": "healthy",
    "redis": "healthy"
  }
}

# Liveness probe
curl https://your-api-service.up.railway.app/api/health/live

# Readiness probe
curl https://your-api-service.up.railway.app/api/health/ready
```

### 데이터베이스 마이그레이션

첫 배포 시 `prisma db push`가 자동으로 실행됩니다. 스키마 변경 시에도 자동으로 적용됩니다.

수동 마이그레이션이 필요한 경우:
```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 연결
railway link

# 마이그레이션 실행
railway run npx prisma db push
```

## 트러블슈팅

### 일반적인 문제

1. **데이터베이스 연결 실패**
   - `DATABASE_URL`이 올바르게 설정되었는지 확인
   - PostgreSQL 서비스가 실행 중인지 확인

2. **Redis 연결 실패**
   - `REDIS_URL`이 올바르게 설정되었는지 확인
   - Redis 서비스가 실행 중인지 확인
   - Redis 없이도 동작해야 한다면 `REDIS_ENABLED=false`로 비활성화

3. **API 키 오류**
   - Polygon.io, Finnhub API 키가 유효한지 확인
   - API 키에 필요한 권한이 있는지 확인

4. **CORS 오류**
   - `CORS_ORIGIN`에 Web 서비스 URL이 정확히 설정되었는지 확인

### 로그 확인

Railway 대시보드에서 각 서비스의 "Logs" 탭을 통해 실시간 로그를 확인할 수 있습니다.

```bash
# Railway CLI로 로그 확인
railway logs
```

## 로컬 개발 환경

### Docker Compose로 로컬 환경 구성

```bash
# 프로젝트 루트에서
docker compose up -d

# 서비스 확인
docker compose ps

# 로그 확인
docker compose logs -f
```

### 환경 변수 설정

```bash
# apps/api/.env
DATABASE_URL=postgresql://usstock:usstock123@localhost:5434/usstock
REDIS_HOST=localhost
REDIS_PORT=6381
PORT=3100

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3100
```

## 비용 최적화

Railway는 사용량 기반 과금입니다. 비용을 최적화하려면:

1. **스케일 다운**: 트래픽이 적은 시간에는 레플리카 수를 줄입니다
2. **Sleep 모드**: 개발/테스트 환경에서는 비활성 시 Sleep 모드 활용
3. **리소스 제한**: 각 서비스에 적절한 CPU/메모리 제한 설정

## 보안 권장사항

1. **환경 변수**: 민감한 정보는 반드시 Railway Variables에 저장
2. **CORS**: 프로덕션에서는 특정 도메인만 허용
3. **API 키 로테이션**: 정기적으로 API 키 갱신
4. **데이터베이스**: Railway의 Private Networking 사용 권장

## 추가 리소스

- [Railway Documentation](https://docs.railway.app)
- [Prisma with Railway](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-railway)
- [NestJS Production](https://docs.nestjs.com/techniques/performance)
