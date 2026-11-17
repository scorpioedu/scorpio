import securityHeaders from "./src/lib/security-headers.cjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type-check only the app during `next build`. Tests and tools import Cloud Functions code whose
  // dependencies (functions/node_modules) are not installed on Vercel; `npm run typecheck` still covers them.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  reactCompiler: true,
  distDir: process.env.SCORPIO_BUILD_DIR || ".next",
  images: {},
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders.securityHeaders({
          development: process.env.NODE_ENV !== "production",
          emulators: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true",
        }),
      },
    ];
  },
};

export default nextConfig;
