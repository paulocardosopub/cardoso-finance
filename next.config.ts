import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  basePath: process.env.GITHUB_ACTIONS === "true" ? "/cardoso-finance" : "",
  assetPrefix: process.env.GITHUB_ACTIONS === "true" ? "/cardoso-finance/" : undefined,
  images: { unoptimized: true },
};

export default nextConfig;
