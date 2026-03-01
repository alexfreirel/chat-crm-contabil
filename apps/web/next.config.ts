import type { NextConfig } from "next";

const backendUrl = process.env.INTERNAL_API_URL || "http://crm-api:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return {
      beforeFiles: [
        // Socket.IO proxy - must be before any page/file matching
        {
          source: "/socket.io",
          destination: `${backendUrl}/socket.io`,
        },
        {
          source: "/socket.io/",
          destination: `${backendUrl}/socket.io/`,
        },
        {
          source: "/socket.io/:path*",
          destination: `${backendUrl}/socket.io/:path*`,
        },
      ],
      afterFiles: [
        {
          source: "/api/:path*",
          destination: `${backendUrl}/:path*`,
        },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
