import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@xmtp/browser-sdk', '@xmtp/wasm-bindings', '@xmtp/proto'],
  async headers() {
    // Baseline hardening headers. Intentionally NO X-Frame-Options / frame CSP
    // — FlameBase must stay embeddable as a Base App / Farcaster Mini App. A
    // full Content-Security-Policy is also omitted (an untested CSP would risk
    // breaking wallet SDKs / RPC connections); these headers harden without it.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
        ],
      },
    ]
  },
};

export default nextConfig;
