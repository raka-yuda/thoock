import type { NextConfig } from "next";

const nextConfig: NextConfig = { output: "standalone", images: { remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }] }, serverExternalPackages: ["sharp", "pg"] };

export default nextConfig;
