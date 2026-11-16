export {};
/** Remaining firebase.ts branches: development debug token default, empty App Check token, and optional progress callbacks. All Firebase SDKs are mocked. */
const mockApp = { name: 'app' };
const mockAuth = { currentUser: null as null | { uid: string; getIdToken: jest.Mock } };
const mockDb = { kind: 'db' };
const mockStorage = { kind: 'storage' };
const mockAi = { generateThing: jest.fn(() => 'generated'), prop: 'value' };

const mockGetApps = jest.fn();
const mockInitializeApp = jest.fn(() => mockApp);
const mockInitializeAppCheck = jest.fn(() => ({ ac: true }));
const mockGetToken = jest.fn();
const mockEnterpriseProvider = jest.fn();
const mockV3Provider = jest.fn();
const mockConnectClientEmulators = jest.fn();
const mockCreateUser = jest.fn();
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockOnAuthStateChanged = jest.fn();
const mockSendReset = jest.fn();
const mockUpdateEmail = jest.fn();
const mockUpdatePassword = jest.fn();
const mockDeleteUser = jest.fn();
const mockSignInWithPopup = jest.fn();
const mockAddScope = jest.fn();
const mockSetDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockDocFn = jest.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') }));
const mockRef = jest.fn((_s: unknown, path: string) => ({ fullPath: path }));
const mockUploadResumable = jest.fn();
const mockGetDownloadURL = jest.fn();
const mockGetAI = jest.fn(() => mockAi);

jest.mock('firebase/app', () => ({ initializeApp: (...a: unknown[]) => (mockInitializeApp as (...x: unknown[]) => unknown)(...a), getApps: () => mockGetApps() }));
jest.mock('firebase/app-check', () => ({
  initializeAppCheck: (...a: unknown[]) => (mockInitializeAppCheck as (...x: unknown[]) => unknown)(...a),
  ReCaptchaEnterpriseProvider: function (k: string) { mockEnterpriseProvider(k); },
  ReCaptchaV3Provider: function (k: string) { mockV3Provider(k); },
  getToken: (...a: unknown[]) => mockGetToken(...a),
}));
jest.mock('../src/lib/firebase-emulator', () => ({ connectClientEmulators: (...a: unknown[]) => mockConnectClientEmulators(...a) }));
jest.mock('firebase/auth', () => ({
  getAuth: () => mockAuth,
  connectAuthEmulator: jest.fn(),
  signInWithEmailAndPassword: (...a: unknown[]) => mockSignIn(...a),
  createUserWithEmailAndPassword: (...a: unknown[]) => mockCreateUser(...a),
  signOut: (...a: unknown[]) => mockSignOut(...a),
  onAuthStateChanged: (...a: unknown[]) => mockOnAuthStateChanged(...a),
  sendPasswordResetEmail: (...a: unknown[]) => mockSendReset(...a),
  updateEmail: (...a: unknown[]) => mockUpdateEmail(...a),
  updatePassword: (...a: unknown[]) => mockUpdatePassword(...a),
  deleteUser: (...a: unknown[]) => mockDeleteUser(...a),
  GoogleAuthProvider: function (this: { addScope: jest.Mock }) { this.addScope = mockAddScope; },
  signInWithPopup: (...a: unknown[]) => mockSignInWithPopup(...a),
}));
jest.mock('firebase/firestore', () => ({
  getFirestore: () => mockDb, connectFirestoreEmulator: jest.fn(),
  doc: (...a: unknown[]) => mockDocFn(...a), setDoc: (...a: unknown[]) => mockSetDoc(...a), getDoc: (...a: unknown[]) => mockGetDoc(...a),
  collection: jest.fn(), getDocs: jest.fn(), query: jest.fn(), where: jest.fn(), writeBatch: jest.fn(), deleteDoc: jest.fn(),
}));
jest.mock('firebase/storage', () => ({
  getStorage: () => mockStorage, connectStorageEmulator: jest.fn(),
  ref: (...a: [unknown, string]) => mockRef(...a),
  uploadBytes: jest.fn(), getDownloadURL: (...a: unknown[]) => mockGetDownloadURL(...a),
  uploadBytesResumable: (...a: unknown[]) => mockUploadResumable(...a), deleteObject: jest.fn(),
}));
jest.mock('firebase/ai', () => ({ getAI: (...a: unknown[]) => (mockGetAI as (...x: unknown[]) => unknown)(...a), GoogleAIBackend: function () { /* backend marker */ } }));

type FirebaseModule = typeof import('../src/lib/firebase');
const g = globalThis as unknown as Record<string, unknown>;

function load(): FirebaseModule {
  let mod!: FirebaseModule;
  jest.isolateModules(() => { mod = jest.requireActual('../src/lib/firebase'); });
  return mod;
}


const env = process.env as Record<string, string | undefined>;
const ENV_KEYS = ['NODE_ENV', 'NEXT_PUBLIC_USE_FIREBASE_EMULATORS', 'NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN', 'NEXT_PUBLIC_RECAPTCHA_SITE_KEY'];
const savedEnv: Record<string, string | undefined> = {};
const savedGlobals = { window: g.window, self: g.self, document: g.document, Image: g.Image, File: g.File };
const savedCreateObjectURL = URL.createObjectURL;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetApps.mockReturnValue([]);
  mockGetToken.mockResolvedValue({ token: 't' });
  ENV_KEYS.forEach(k => { savedEnv[k] = env[k]; });
  delete env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS;
  delete env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN;
  delete env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  ENV_KEYS.forEach(k => { if (savedEnv[k] === undefined) delete env[k]; else env[k] = savedEnv[k]; });
  Object.entries(savedGlobals).forEach(([k, v]) => { if (v === undefined) delete g[k]; else g[k] = v; });
  delete g.FIREBASE_APPCHECK_DEBUG_TOKEN;
  URL.createObjectURL = savedCreateObjectURL;
  jest.restoreAllMocks();
});

describe('App Check debug token', () => {
  beforeEach(() => { g.window = {}; g.self = g; });

  it('defaults the debug token global to true in development when no token is configured', () => {
    env.NODE_ENV = 'development';
    load();
    expect(g.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
  });

  it('does not touch the debug token global outside development without a configured token', () => {
    env.NODE_ENV = 'production';
    load();
    expect('FIREBASE_APPCHECK_DEBUG_TOKEN' in g).toBe(false);
  });

  it('does not log success when the warm-up token request resolves with nothing', async () => {
    mockGetToken.mockResolvedValue(undefined);
    load();
    await new Promise(r => setImmediate(r));
    expect(mockGetToken).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalledWith('[Firebase App Check] Token generated successfully.');
  });
});

describe('uploadFilesToStorage without a progress callback', () => {
  type Handlers = { next: (s: { bytesTransferred: number; totalBytes: number }) => void; done: () => Promise<void> };
  let handlers: Handlers[];
  const tick = () => new Promise(r => setImmediate(r));
  beforeEach(() => {
    handlers = [];
    jest.spyOn(Date, 'now').mockReturnValue(1700);
    mockUploadResumable.mockImplementation(() => ({
      snapshot: { ref: { id: 'snap-ref' } },
      on: (_evt: string, next: Handlers['next'], _err: unknown, done: Handlers['done']) => { handlers.push({ next, done }); },
    }));
    mockGetDownloadURL.mockResolvedValue('https://dl/url');
  });

  it('uploads a file with an empty name using an empty extension', async () => {
    const p = load().uploadFilesToStorage([{ name: '', type: 'application/pdf', size: 3 } as unknown as File], 'u1');
    await tick();
    expect(mockRef).toHaveBeenCalledWith(mockStorage, 'submissions/u1/1700_.');
    handlers[0].next({ bytesTransferred: 1, totalBytes: 2 });
    await handlers[0].done();
    const [out] = await p;
    expect(out).toMatchObject({ name: '', url: 'https://dl/url', size: 3 });
  });

  it('compresses and uploads an image silently when no callback is given', async () => {
    const canvas = { width: 0, height: 0, getContext: jest.fn(() => ({ drawImage: jest.fn() })), toBlob: jest.fn() };
    canvas.toBlob.mockImplementation((cb: (b: unknown) => void) => cb({}));
    g.document = { createElement: jest.fn(() => canvas) };
    g.Image = function (this: { width: number; height: number; onload: () => void }) {
      this.width = 100; this.height = 100;
      Object.defineProperty(this, 'src', { set: () => { setImmediate(() => this.onload()); } });
    };
    URL.createObjectURL = jest.fn(() => 'blob:x');
    g.File = class { size = 55; constructor(public parts: unknown[], public name: string, public opts: { type: string }) {} };
    const p = load().uploadFilesToStorage([{ name: 'pic.png', type: 'image/png', size: 10 } as unknown as File], 'u1');
    await new Promise(r => setTimeout(r, 10));
    handlers[0].next({ bytesTransferred: 1, totalBytes: 2 });
    await handlers[0].done();
    const [out] = await p;
    expect(canvas.toBlob.mock.calls[0][2]).toBe(0.8);
    expect(out).toMatchObject({ name: 'pic.png', size: 55, url: 'https://dl/url' });
  });
});
