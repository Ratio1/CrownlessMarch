/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    typedRoutes: true
  },
  webpack(config) {
    config.resolve.alias.canvas = false;
    return config;
  }
};

export default nextConfig;
