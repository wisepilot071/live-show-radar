import type { NextConfig } from "next";

/**
 * Baseline security headers for every route. (A strict CSP is deferred: Next's
 * inline bootstrap scripts need nonces, which would make every page dynamic.)
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Narrow CSP: only directives that don't need script nonces. Frames are
  // limited to YouTube's official embed hosts (Live on Stage); nothing may
  // frame this site; no plugins; no <base> hijacking.
  {
    key: "Content-Security-Policy",
    value: [
      "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
