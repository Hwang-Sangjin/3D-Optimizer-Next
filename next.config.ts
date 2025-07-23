import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["sharp", "@gltf-transform/functions"],
  },
};

export default nextConfig;
