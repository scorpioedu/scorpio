"use client";

import * as React from "react";

export type FontOption =
  "figtree" | "inter" | "ibm-plex-sans" | "verdana" | "roboto-mono" | "pt-serif" | "atkinson";

const themeColors = ["default", "blue", "emerald", "monochrome", "custom"] as const;
const themeClasses = themeColors.map((color) => `theme-${color}`);

export type ThemeColor = (typeof themeColors)[number];

interface AppearanceContextType {
  font: FontOption;
  setFont: (font: FontOption) => void;
  themeColor: ThemeColor;
  setThemeColor: (theme: ThemeColor) => void;
  customColor: string;
  setCustomColor: (color: string) => void;
}

/** White text on a #rrggbb fill, or near-black when the fill is light (white would fall under ~3:1). */
function readableTextOn(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return "oklch(1 0 0)";
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.3 ? "oklch(0.15 0 0)" : "oklch(1 0 0)";
}

const AppearanceContext = React.createContext<AppearanceContextType | undefined>(undefined);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [font, setFontState] = React.useState<FontOption>("figtree");
  const [themeColor, setThemeColorState] = React.useState<ThemeColor>("default");
  const [customColor, setCustomColorState] = React.useState<string>("#3b82f6");

  React.useEffect(() => {
    const storedFont = localStorage.getItem("app-font") as FontOption;
    if (
      storedFont &&
      [
        "figtree",
        "inter",
        "ibm-plex-sans",
        "verdana",
        "roboto-mono",
        "pt-serif",
        "atkinson",
      ].includes(storedFont)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage after mount so the server render and the first client render match
      setFontState(storedFont);
    }

    const storedTheme = localStorage.getItem("app-theme-color");
    const savedColor = themeColors.find((color) => color === storedTheme);
    if (savedColor) {
      setThemeColorState(savedColor);
    }

    const storedCustomColor = localStorage.getItem("app-custom-color");
    if (storedCustomColor) {
      setCustomColorState(storedCustomColor);
    }
  }, []);

  const setFont = (newFont: FontOption) => {
    setFontState(newFont);
    localStorage.setItem("app-font", newFont);
  };

  const setThemeColor = (newTheme: ThemeColor) => {
    setThemeColorState(newTheme);
    localStorage.setItem("app-theme-color", newTheme);

    // Smooth transition for all elements when changing theme
    const html = document.documentElement;
    html.classList.add("theme-transition-all");
    setTimeout(() => {
      html.classList.remove("theme-transition-all");
    }, 300);
  };

  const setCustomColor = (newColor: string) => {
    setCustomColorState(newColor);
    localStorage.setItem("app-custom-color", newColor);
    if (themeColor === "custom") {
      document.documentElement.style.setProperty("--primary", newColor);
      document.documentElement.style.setProperty("--primary-foreground", readableTextOn(newColor));
    }
  };

  // Synchronize classes with state
  React.useEffect(() => {
    const html = document.documentElement;

    // Manage Font Classes
    const fontClasses = [
      "font-figtree",
      "font-inter",
      "font-ibm-plex-sans",
      "font-verdana",
      "font-roboto-mono",
      "font-pt-serif",
      "font-atkinson",
    ];
    html.classList.remove(...fontClasses);
    html.classList.add(`font-${font}`);

    // Manage Theme Classes
    html.classList.remove(...themeClasses);
    html.classList.add(`theme-${themeColor}`);

    if (themeColor === "custom") {
      html.style.setProperty("--primary", customColor);
      // Hover tints, rings and the sidebar follow --primary in globals.css; only the text on
      // top needs picking here: white unless the colour is too light for it.
      html.style.setProperty("--primary-foreground", readableTextOn(customColor));
    } else {
      html.style.removeProperty("--primary");
      html.style.removeProperty("--primary-foreground");
    }
  }, [font, themeColor, customColor]);

  return (
    <AppearanceContext.Provider
      value={{ font, setFont, themeColor, setThemeColor, customColor, setCustomColor }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = React.useContext(AppearanceContext);
  if (context === undefined) {
    throw new Error("useAppearance must be used within an AppearanceProvider");
  }
  return context;
}
