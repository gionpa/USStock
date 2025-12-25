-- CreateTable
CREATE TABLE "news" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT NOT NULL,
    "image_url" TEXT,
    "source" TEXT NOT NULL,
    "symbols" TEXT[],
    "sentiment" DOUBLE PRECISION,
    "published_at" TIMESTAMP(3) NOT NULL,
    "title_ko" TEXT,
    "summary_ko" TEXT,
    "translated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "alert_enabled" BOOLEAN NOT NULL DEFAULT false,
    "alert_price_min" DOUBLE PRECISION,
    "alert_price_max" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_prices" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ko',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "notifications" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_external_id_key" ON "news"("external_id");

-- CreateIndex
CREATE INDEX "news_published_at_idx" ON "news"("published_at" DESC);

-- CreateIndex
CREATE INDEX "news_symbols_idx" ON "news"("symbols");

-- CreateIndex
CREATE INDEX "news_provider_idx" ON "news"("provider");

-- CreateIndex
CREATE INDEX "watchlist_user_id_idx" ON "watchlist"("user_id");

-- CreateIndex
CREATE INDEX "watchlist_symbol_idx" ON "watchlist"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_user_id_symbol_key" ON "watchlist"("user_id", "symbol");

-- CreateIndex
CREATE INDEX "stock_prices_symbol_idx" ON "stock_prices"("symbol");

-- CreateIndex
CREATE INDEX "stock_prices_date_idx" ON "stock_prices"("date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "stock_prices_symbol_date_key" ON "stock_prices"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");
