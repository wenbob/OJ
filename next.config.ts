import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-Accel-Buffering", value: "no" },
];

const requestedBuildWorkers = Number(
  process.env.NEXT_PRIVATE_BUILD_WORKER_COUNT,
);
const constrainedBuildWorkers =
  Number.isInteger(requestedBuildWorkers) && requestedBuildWorkers > 0
    ? requestedBuildWorkers
    : undefined;
const distDir = process.env.NEXT_DIST_DIR === ".next-e2e" ? ".next-e2e" : ".next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  distDir,
  experimental: constrainedBuildWorkers
    ? { cpus: constrainedBuildWorkers }
    : undefined,
  async headers() {
    return [
      {
        headers: securityHeaders,
        source: "/:path*",
      },
    ];
  },
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
