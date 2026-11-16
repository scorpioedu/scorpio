/**
 * Pure helpers for running the app against the Firebase Emulator Suite.
 * Nothing here runs unless NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" (client)
 * or an emulator host variable is set (server), so production behaviour is unchanged.
 */
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";

export const EMULATOR_HOST = "127.0.0.1";
export const EMULATOR_PORTS = { auth: 9099, firestore: 8080, storage: 9199 } as const;
export const DEFAULT_EMULATOR_PROJECT_ID = "demo-scorpio";

/** The flag must be exactly the string "true"; anything else (unset, "false", "1") is off. */
export function isEmulatorModeEnabled(flag: string | undefined): boolean {
  return flag === "true";
}

export type EmulatorConnectors = {
  connectAuthEmulator: (auth: Auth, url: string, options?: { disableWarnings: boolean }) => void;
  connectFirestoreEmulator: (db: Firestore, host: string, port: number) => void;
  connectStorageEmulator: (storage: FirebaseStorage, host: string, port: number) => void;
};

export type EmulatorPortOverrides = { auth?: string; firestore?: string; storage?: string };

function parsePort(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

/** Applies optional port overrides (raw env strings); invalid or empty values fall back to defaults. */
export function resolveEmulatorPorts(overrides: EmulatorPortOverrides = {}) {
  return {
    auth: parsePort(overrides.auth, EMULATOR_PORTS.auth),
    firestore: parsePort(overrides.firestore, EMULATOR_PORTS.firestore),
    storage: parsePort(overrides.storage, EMULATOR_PORTS.storage),
  };
}

/** Connects the client SDKs to local emulators when enabled. Returns whether it connected. */
export function connectClientEmulators(
  flag: string | undefined,
  services: { auth: Auth; db: Firestore; storage: FirebaseStorage },
  connectors: EmulatorConnectors,
  portOverrides: EmulatorPortOverrides = {}
): boolean {
  if (!isEmulatorModeEnabled(flag)) return false;
  const ports = resolveEmulatorPorts(portOverrides);
  connectors.connectAuthEmulator(services.auth, `http://${EMULATOR_HOST}:${ports.auth}`, {
    disableWarnings: true,
  });
  connectors.connectFirestoreEmulator(services.db, EMULATOR_HOST, ports.firestore);
  connectors.connectStorageEmulator(services.storage, EMULATOR_HOST, ports.storage);
  return true;
}

export type AdminInitPlan =
  | { mode: "emulator"; projectId: string }
  | { mode: "cert"; projectId: string; clientEmail: string; privateKey: string }
  | { mode: "missing"; hasProjectId: boolean; hasClientEmail: boolean; hasPrivateKey: boolean };

/**
 * Decides how firebase-admin should initialise. Emulator hosts take precedence so dummy
 * .env.example keys never reach cert(); otherwise the original credential path is used.
 */
export function planAdminInit(env: Record<string, string | undefined>): AdminInitPlan {
  const projectId = env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST) {
    return { mode: "emulator", projectId: projectId || DEFAULT_EMULATOR_PROJECT_ID };
  }
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY
    ? env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/^"|"$/g, "")
    : undefined;
  if (!projectId || !clientEmail || !privateKey) {
    return { mode: "missing", hasProjectId: !!projectId, hasClientEmail: !!clientEmail, hasPrivateKey: !!privateKey };
  }
  return { mode: "cert", projectId, clientEmail, privateKey };
}
