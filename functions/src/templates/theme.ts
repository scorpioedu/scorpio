/**
 * The look shared by every Scorpio email: the app's dark theme (globals.css `.dark`) as hex,
 * because email clients do not understand oklch or CSS variables.
 */

export const SITE = "https://scorpioedu.org";

export const colors = {
  page: "#141518",
  card: "#1a1b1e",
  panel: "#222327",
  border: "#35343a",
  text: "#f0f0f0",
  body: "#c9c9cf",
  muted: "#a0a0a0",
  faint: "#76767e",
  primary: "#8c5cff",
  primaryText: "#ffffff",
  accentText: "#c5b7ff",
  accentPanel: "#2a2836",
} as const;

export const font =
  "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Served from the app's public/ folder; Gmail and Outlook do not show .ico or .svg images. */
export const LOGO_URL = `${SITE}/email/logo-dark.png`;
