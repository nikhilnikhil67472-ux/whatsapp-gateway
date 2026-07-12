import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@whiskeysockets/baileys", "better-sqlite3", "pino", "jimp", "sharp"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
