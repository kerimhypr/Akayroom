import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  outputFileTracingRoot: process.cwd(),
  images: { unoptimized: true },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
