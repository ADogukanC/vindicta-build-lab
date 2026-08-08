import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Item icons uploaded through the admin panel are stored as data URLs in the
  // database, so the built-in image optimizer is not involved.
  images: { unoptimized: true },
};

export default nextConfig;
