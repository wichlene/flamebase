import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@xmtp/browser-sdk', '@xmtp/wasm-bindings', '@xmtp/proto'],
};

export default nextConfig;
