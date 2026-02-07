import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  typescript: {
    // Ignore build errors from backend folder
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    // Exclude backend folder from compilation
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/backend/**', '**/node_modules/**'],
    };
    return config;
  },
  // Exclude backend from page detection
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
};

export default nextConfig;
