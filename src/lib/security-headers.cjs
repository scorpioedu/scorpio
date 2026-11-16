// Security response headers (audit finding C-007 / ticket RT-09).
//
// This is a CommonJS file on purpose: next.config.mjs imports it directly (Node cannot load
// TypeScript there) and the jest tests require it.
//
// The Content-Security-Policy ships REPORT-ONLY (owner decision, DECISIONS.md). Switching it to
// enforcing means renaming the header key in `securityHeaders` after a week of clean reports.

/**
 * @param {{ development?: boolean, emulators?: boolean }} [options]
 * @returns {string}
 */
function buildCsp(options = {}) {
  const development = options.development === true;
  const emulators = options.emulators === true;

  const firebaseApis = [
    "https://*.googleapis.com", // identitytoolkit, securetoken, firestore, firebasestorage, firebase AI, app check
    "https://*.firebaseio.com",
    "wss://*.firebaseio.com",
    "https://*.firebaseapp.com",
    "https://*.cloudfunctions.net",
    "https://www.google.com", // reCAPTCHA / App Check
  ];
  // Local emulators and the Next.js dev server (HMR websocket) are only needed outside production.
  const local = development || emulators ? ["http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*"] : [];

  const directives = {
    "default-src": ["'self'"],
    // 'unsafe-inline' is required today for the inline theme script (src/app/layout.tsx), the
    // intro script (src/components/loading-screen.tsx) and Next's own bootstrap scripts.
    // A nonce/hash policy is tracked in FOLLOWUPS.md.
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(development ? ["'unsafe-eval'"] : []),
      "https://www.google.com/recaptcha/",
      "https://www.gstatic.com/recaptcha/",
      "https://apis.google.com", // Firebase Auth popup (Google sign-in)
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://*.googleusercontent.com",
      "https://firebasestorage.googleapis.com",
      "https://storage.googleapis.com",
    ],
    "font-src": ["'self'", "data:"], // next/font self-hosts Google Fonts
    "connect-src": ["'self'", ...firebaseApis, ...local],
    "frame-src": [
      "'self'", // /Scorpio_Verifiable_Physics_Tutoring_LLM.pdf preview on /research
      "https://www.desmos.com", // calculator embeds
      "https://www.google.com", // reCAPTCHA challenge
      "https://*.firebaseapp.com", // Firebase Auth popup/iframe
      "https://accounts.google.com",
    ],
    "media-src": ["'self'", "blob:", "data:"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
    "report-uri": ["/api/csp-report"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

// Only features the app does not use are switched off. Used features (grep of src):
//  - microphone: speech recognition in src/app/student/tutor/page.tsx
//  - fullscreen: lockdown mode (assignment-view) and demo video
//  - clipboard-write: copy buttons; the Desmos iframes request clipboard-write/read via `allow`
//    (delegation only works if this header permits the embedded origin).
const PERMISSIONS_POLICY = [
  "camera=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "bluetooth=()",
  "serial=()",
  "hid=()",
  "midi=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "microphone=(self)",
  "fullscreen=(self)",
  'clipboard-write=(self "https://www.desmos.com")',
  'clipboard-read=(self "https://www.desmos.com")',
].join(", ");

/**
 * @param {{ development?: boolean, emulators?: boolean }} [options]
 * @returns {{ key: string, value: string }[]}
 */
function securityHeaders(options = {}) {
  return [
    // SAMEORIGIN, not DENY: /research frames its own same-origin PDF, which DENY would block.
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Content-Security-Policy-Report-Only", value: buildCsp(options) },
  ];
}

module.exports = { buildCsp, securityHeaders, PERMISSIONS_POLICY };
