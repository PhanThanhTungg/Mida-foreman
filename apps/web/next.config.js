/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@foreman/types'],
};
module.exports = nextConfig;
