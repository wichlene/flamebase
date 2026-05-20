import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@xmtp/browser-sdk', '@xmtp/wasm-bindings', '@xmtp/proto'],
  async redirects() {
    return [
      {
        source: '/.well-known/farcaster.json',
        destination:
          'https://api.farcaster.xyz/miniapps/hosted-manifest/019e470f-01d8-7f5a-17c5-e2beac0b1781',
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
