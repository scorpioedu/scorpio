import type { Metadata, Viewport } from "next";
import {
  Atkinson_Hyperlegible,
  Figtree,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  Lora,
  PT_Serif,
  Roboto_Mono,
} from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

// Default font for the whole app (the font-figtree class and font-sans); other fonts are opt-in in Settings.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: true,
  fallback: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  fallback: [
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false, // opt-in in Settings
});

const ptSerif = PT_Serif({
  variable: "--font-pt-serif",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false, // not used above-the-fold; lazy-load to unblock first paint
});

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  fallback: [
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false, // not used above-the-fold; lazy-load to unblock first paint
});

export const metadata: Metadata = {
  title: {
    default: "Scorpio • AP Physics homework, graded for you",
    template: "%s • Scorpio",
  },
  description:
    "Ready-made AP Physics 1, 2 and C: Mechanics problem sets that grade themselves and tutor with hints, not answers. Run not for profit.",
  keywords: [
    "AP Physics homework",
    "AP Physics 1",
    "AP Physics 2",
    "AP Physics C: Mechanics",
    "Auto-graded physics problems",
    "Physics teacher tool",
    "Socratic AI tutor",
    "Raise AI tutor",
    "Physics LMS",
    "Scorpio Physics",
  ],
  icons: [
    { rel: "icon", url: "/favicon.ico" },
    { rel: "icon", url: "/favicon-light.ico", media: "(prefers-color-scheme: light)" },
    { rel: "icon", url: "/favicon-dark.ico", media: "(prefers-color-scheme: dark)" },
    { rel: "icon", type: "image/svg+xml", url: "/favicon.svg" },
    { rel: "apple-touch-icon", url: "/favicon-light.ico" }, // Fallback since png is missing
  ],
  metadataBase: new URL("https://scorpioedu.org"),
  openGraph: {
    title: "Scorpio • AP Physics homework, graded for you",
    description:
      "Ready-made AP Physics 1, 2 and C: Mechanics problem sets that grade themselves and tutor with hints, not answers. Run not for profit.",
    url: "https://scorpioedu.org",
    siteName: "Scorpio",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Scorpio: AP Physics homework, graded for you",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  other: {
    language: "en",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Scorpio",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${lora.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const migrationKey = "app-font-migrated-figtree";
                  const defaultFont = "figtree";
                  const fonts = ["figtree", "inter", "ibm-plex-sans", "verdana", "roboto-mono", "pt-serif", "atkinson"];
                  let font = localStorage.getItem("app-font");

                  if (localStorage.getItem(migrationKey) !== "true") {
                    font = defaultFont;
                    localStorage.setItem("app-font", font);
                    localStorage.setItem(migrationKey, "true");
                  }

                  document.documentElement.classList.add("font-" + (fonts.includes(font) ? font : defaultFont));
                } catch {}
              })();
            `,
          }}
        />
        {/* tweakcn design-preview — dev only, never load in production */}
        {process.env.NODE_ENV === "development" && (
          <script async crossOrigin="anonymous" src="https://tweakcn.com/live-preview.min.js" />
        )}
      </head>
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${ibmPlexSans.variable} ${ptSerif.variable} ${atkinson.variable} ${robotoMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
