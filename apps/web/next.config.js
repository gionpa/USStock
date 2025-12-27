/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Rewrites only for local development (when NEXT_PUBLIC_API_URL is not set)
  // In production (Railway), api.ts uses NEXT_PUBLIC_API_URL directly
  async rewrites() {
    // Skip rewrites in production where API URL is configured
    if (process.env.NEXT_PUBLIC_API_URL) {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3100/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
