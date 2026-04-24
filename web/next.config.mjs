/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
      // Cloudflare R2 custom domain for static assets (videos/images)
      ...(process.env.NEXT_PUBLIC_R2_PUBLIC_URL
        ? [
            {
              protocol: 'https',
              hostname: new URL(process.env.NEXT_PUBLIC_R2_PUBLIC_URL).hostname,
            },
          ]
        : []),
      // Generic R2 public bucket host (when you haven't wired a custom domain yet).
      { protocol: 'https', hostname: '*.r2.dev' },
      // Supabase Storage (for any user-uploaded avatars or Kenyan backdrops).
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  // Allow external video sources
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://movies.birgenai.com' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
};

export default nextConfig;
