import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // dockerode → ssh2 → cpu-features has a native .node addon that Turbopack
  // cannot resolve when built with --ignore-scripts. Leave as runtime require().
  serverExternalPackages: ["dockerode", "ssh2", "cpu-features"],
  typescript: {
    tsconfigPath: "./tsconfig.app.json",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sonarcloud.io",
        pathname: "/api/project_badges/measure",
      },
    ],
  },
};

export default nextConfig;
