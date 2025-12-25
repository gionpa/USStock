// Parse Redis URL (Railway provides this format)
function parseRedisUrl(url: string | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
    };
  } catch {
    return null;
  }
}

export default () => {
  const redisUrl = parseRedisUrl(process.env.REDIS_URL);
  const isProduction = process.env.NODE_ENV === 'production';
  const redisEnvConfigured = Boolean(
    process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_PORT,
  );
  const redisEnabledEnv = process.env.REDIS_ENABLED;
  const redisEnabled = redisEnabledEnv != null
    ? !['false', '0', 'off', 'no'].includes(redisEnabledEnv.toLowerCase())
    : redisEnvConfigured;

  return {
    port: parseInt(process.env.PORT || '3100', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction,
    corsOrigin: process.env.CORS_ORIGIN || (isProduction ? '*' : 'http://localhost:3200'),

    // Database (PostgreSQL)
    database: {
      url: process.env.DATABASE_URL || 'postgresql://usstock:usstock123@localhost:5434/usstock',
    },

    // API Keys for data providers
    polygon: {
      apiKey: process.env.POLYGON_API_KEY || '',
      baseUrl: 'https://api.polygon.io',
      wsUrl: 'wss://socket.polygon.io',
      wsEnabled: process.env.POLYGON_WS_ENABLED !== 'false',
    },

    finnhub: {
      apiKey: process.env.FINNHUB_API_KEY || '',
      baseUrl: 'https://finnhub.io/api/v1',
      wsUrl: 'wss://ws.finnhub.io',
      wsEnabled: process.env.FINNHUB_WS_ENABLED !== 'false',
    },

    // Redis configuration - supports both REDIS_URL and individual settings
    redis: {
      enabled: redisEnabled,
      host: redisUrl?.host || process.env.REDIS_HOST || 'localhost',
      port: redisUrl?.port || parseInt(process.env.REDIS_PORT || '6379', 10),
      password: redisUrl?.password || process.env.REDIS_PASSWORD || undefined,
    },

    // Vector DB configuration (Pinecone)
    pinecone: {
      apiKey: process.env.PINECONE_API_KEY || '',
      environment: process.env.PINECONE_ENVIRONMENT || '',
      indexName: process.env.PINECONE_INDEX_NAME || 'usstock-news',
    },

    // Anthropic API for translation
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    },
  };
};
