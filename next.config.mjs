import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the file-tracing root to this project so the parent-dir lockfile does
  // not confuse the Vercel build.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
