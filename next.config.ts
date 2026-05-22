import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

function buildCsp(): string {
  const directives = [
    "default-src 'self'",
    // Next.js HMR (dev) needs 'unsafe-eval'. Production only needs 'unsafe-inline'.
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    // Dev: HMR uses WebSocket on same host; allow ws/wss explicitly.
    isDev
      ? "connect-src 'self' ws://localhost:* wss://localhost:*"
      : "connect-src 'self'",
    // data: needed for inline font-face used by some CJK/calligraphy libraries.
    "font-src 'self' data:",
    "frame-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join("; ");
}

const commonHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // HSTS only meaningful in production (HTTPS). Omit in dev to avoid locking localhost to HTTPS.
  ...(!isDev
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
  { key: "Content-Security-Policy", value: buildCsp() },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: commonHeaders,
      },
    ];
  },
};

export default nextConfig;
