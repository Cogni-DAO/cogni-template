import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
