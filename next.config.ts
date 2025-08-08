import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "@gltf-transform/functions"],
};

export default nextConfig;
