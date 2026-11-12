import securityHeaders from "./src/lib/security-headers.cjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  distDir: process.env.SCORPIO_BUILD_DIR || ".next",
  images: {
  },
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
