import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: projectDir,
    serverComponentsExternalPackages: ['@node-rs/argon2', '@ratio1/cstore-auth-ts'],
  },
  reactStrictMode: true,
};

export default nextConfig;
