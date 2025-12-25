/** @type {import('next').NextConfig} */
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
const apiUrl = rawApiUrl.startsWith('http://') || rawApiUrl.startsWith('https://')
  ? rawApiUrl
  : `https://${rawApiUrl}`;

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
