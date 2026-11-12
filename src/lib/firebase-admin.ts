import * as admin from 'firebase-admin';
import type { firestore, auth, app } from 'firebase-admin';
import { planAdminInit } from './firebase-emulator';

// Re-export type for external use
export type { firestore, auth, app };

let _app: app.App | null = null;

function getApp(): app.App | null {
  if (typeof window !== 'undefined') return null;

  if (admin.apps.length > 0) {
    return admin.apps[0];
  }
  
  if (_app) return _app;

  const plan = planAdminInit(process.env);

  if (plan.mode === 'missing') {
    console.error('[firebase-admin] Missing credentials:', {
      hasProjectId: plan.hasProjectId,
      hasClientEmail: plan.hasClientEmail,
      hasPrivateKey: plan.hasPrivateKey
    });
    return null; // Return null instead of throwing to allow routes to handle the error
  }

  const projectId = plan.projectId;
  console.log('[firebase-admin] Initializing for Project:', projectId, plan.mode === 'emulator' ? '(emulator, no credentials)' : '');

  try {
    _app = plan.mode === 'emulator'
      ? admin.initializeApp({ projectId })
      : admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail: plan.clientEmail,
            privateKey: plan.privateKey
          }),
          projectId,
        });
    console.log('[firebase-admin] Initialized successfully.');
    return _app;
  } catch (e: any) {
    if (/already exists/.test(e.message)) {
      return admin.app();
    }
    console.error('[firebase-admin] Initialization failed:', e);
    return null;
  }
}

/**
 * Lazy getters for Firebase Admin services.
 */
export const adminDb: firestore.Firestore = new Proxy({} as firestore.Firestore, {
  get: (_, prop) => {
    const app = getApp();
    if (!app) return undefined;
    const service = admin.firestore(app);
    const value = (service as any)[prop];
    return typeof value === 'function' ? value.bind(service) : value;
  }
});

export const adminAuth: auth.Auth = new Proxy({} as auth.Auth, {
  get: (_, prop) => {
    const app = getApp();
    if (!app) return undefined;
    const service = admin.auth(app);
    const value = (service as any)[prop];
    return typeof value === 'function' ? value.bind(service) : value;
  }
});

export const adminFieldWithValue: typeof firestore.FieldValue = new Proxy({} as typeof firestore.FieldValue, {
  get: (_, prop) => {
    const app = getApp();
    if (!app) return undefined;
    const FV = admin.firestore.FieldValue;
    const value = (FV as any)[prop];
    return typeof value === 'function' ? value.bind(FV) : value;
  }
});
