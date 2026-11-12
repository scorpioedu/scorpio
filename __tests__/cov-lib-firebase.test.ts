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

const ENV_KEYS = ['NEXT_PUBLIC_USE_FIREBASE_EMULATORS', 'NEXT_PUBLIC_RECAPTCHA_PROVIDER', 'NEXT_PUBLIC_RECAPTCHA_SITE_KEY',
  'NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN'] as const;
const savedEnv: Record<string, string | undefined> = {};
const savedGlobals = { window: g.window, self: g.self, document: g.document, Image: g.Image, FileReader: g.FileReader, fetch: g.fetch, File: g.File };
const savedCreateObjectURL = URL.createObjectURL;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetApps.mockReturnValue([]);
  mockGetToken.mockResolvedValue({ token: 't' });
  mockAuth.currentUser = null;
  ENV_KEYS.forEach(k => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  ENV_KEYS.forEach(k => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
  Object.entries(savedGlobals).forEach(([k, v]) => { if (v === undefined) delete g[k]; else g[k] = v; });
  URL.createObjectURL = savedCreateObjectURL;
  jest.restoreAllMocks();
});

describe('initialisation', () => {
  it('initialises a new app when none exists and skips App Check on the server', () => {
    const m = load();
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockInitializeAppCheck).not.toHaveBeenCalled();
    expect(m.default).toBe(mockApp);
    expect(m.auth).toBe(mockAuth);
    expect(m.db).toBe(mockDb);
    expect(m.storage).toBe(mockStorage);
    expect(m.appCheck).toBeNull();
  });

  it('reuses an existing app', () => {
    const existing = { name: 'existing' };
    mockGetApps.mockReturnValue([existing]);
    const m = load();
    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(m.default).toBe(existing);
  });

  it('forwards the emulator flag to connectClientEmulators', () => {
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = 'true';
    load();
    expect(mockConnectClientEmulators.mock.calls[0][0]).toBe('true');
    expect(mockConnectClientEmulators.mock.calls[0][1]).toEqual({ auth: mockAuth, db: mockDb, storage: mockStorage });
  });
});

describe('App Check (browser)', () => {
  beforeEach(() => { g.window = {}; g.self = g; });

  it('uses the enterprise provider by default and warms up a token', async () => {
    const m = load();
    expect(mockEnterpriseProvider).toHaveBeenCalledTimes(1);
    expect(mockV3Provider).not.toHaveBeenCalled();
    expect(mockInitializeAppCheck).toHaveBeenCalledWith(mockApp, expect.objectContaining({ isTokenAutoRefreshEnabled: true }));
    expect(m.appCheck).toEqual({ ac: true });
    await Promise.resolve(); await Promise.resolve();
    expect(console.log).toHaveBeenCalledWith('[Firebase App Check] Token generated successfully.');
  });

  it('uses the v3 provider with the configured site key', () => {
    process.env.NEXT_PUBLIC_RECAPTCHA_PROVIDER = 'v3';
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = 'my-key';
    load();
    expect(mockV3Provider).toHaveBeenCalledWith('my-key');
    expect(mockEnterpriseProvider).not.toHaveBeenCalled();
  });

  it('skips App Check entirely in emulator mode', () => {
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = 'true';
    expect(load().appCheck).toBeNull();
    expect(mockInitializeAppCheck).not.toHaveBeenCalled();
  });

  it('sets the debug token global to true when the env value is "true"', () => {
    process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN = 'true';
    load();
    expect((g as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
    delete (g as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN;
  });

  it('sets the debug token global to the custom token string', () => {
    process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN = 'custom-debug';
    load();
    expect((g as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe('custom-debug');
    delete (g as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN;
  });

  it('warns when initialisation throws', () => {
    mockInitializeAppCheck.mockImplementationOnce(() => { throw new Error('init bad'); });
    expect(load().appCheck).toBeNull();
    expect(console.warn).toHaveBeenCalledWith('[Firebase App Check] Initialization failed:', expect.any(Error));
  });

  it('warns when the initial token fetch fails', async () => {
    mockGetToken.mockRejectedValue(new Error('fetch bad'));
    load();
    await new Promise(r => setImmediate(r));
    expect(console.warn).toHaveBeenCalledWith('[Firebase App Check] Initial token fetch error:', expect.any(Error));
  });

  it('does not log success when the token is empty', async () => {
    mockGetToken.mockResolvedValue({});
    load();
    await new Promise(r => setImmediate(r));
    expect(console.log).not.toHaveBeenCalledWith('[Firebase App Check] Token generated successfully.');
  });
});

describe('getGenAIInstance and genAI proxy', () => {
  it('creates the AI instance once', () => {
    const m = load();
    expect(m.getGenAIInstance()).toBe(mockAi);
    expect(m.getGenAIInstance()).toBe(mockAi);
    expect(mockGetAI).toHaveBeenCalledTimes(1);
    expect(mockGetAI).toHaveBeenCalledWith(mockApp, expect.objectContaining({ useLimitedUseAppCheckTokens: true }));
  });
  it('lazily proxies properties and binds functions to the instance', () => {
    const m = load();
    expect(mockGetAI).not.toHaveBeenCalled();
    expect((m.genAI as unknown as typeof mockAi).prop).toBe('value');
    expect((m.genAI as unknown as typeof mockAi).generateThing()).toBe('generated');
  });
});

describe('auth helpers', () => {
  const okResponse = (body: unknown = {}) => ({ ok: true, json: async () => body });
  const failResponse = (body: unknown) => ({ ok: false, json: async () => body });
  let fetchMock: jest.Mock;
  beforeEach(() => { fetchMock = jest.fn(); g.fetch = fetchMock; });

  it('register creates the user, calls the register API with the id token and returns the credential', async () => {
    const credential = { user: { getIdToken: jest.fn().mockResolvedValue('tok') } };
    mockCreateUser.mockResolvedValue(credential);
    fetchMock.mockResolvedValue(okResponse());
    const out = await load().register('a@b.c', 'pw', 'teacher', 'Ann', 'CODE');
    expect(out).toBe(credential);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/register');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ role: 'teacher', name: 'Ann', code: 'CODE' });
  });

  it('register rolls back the new auth user and surfaces the API error', async () => {
    const credential = { user: { getIdToken: jest.fn().mockResolvedValue('tok') } };
    mockCreateUser.mockResolvedValue(credential);
    mockDeleteUser.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(failResponse({ error: 'Bad code' }));
    await expect(load().register('a@b.c', 'pw', 'student', 'Bo')).rejects.toThrow('Bad code');
    expect(mockDeleteUser).toHaveBeenCalledWith(credential.user);
  });

  it('register uses a default message and tolerates a failing rollback', async () => {
    const credential = { user: { getIdToken: jest.fn().mockResolvedValue('tok') } };
    mockCreateUser.mockResolvedValue(credential);
    mockDeleteUser.mockRejectedValue(new Error('cannot delete'));
    fetchMock.mockResolvedValue(failResponse({}));
    await expect(load().register('a@b.c', 'pw', 'student', 'Bo')).rejects.toThrow('Registration failed');
  });

  it('login delegates to signInWithEmailAndPassword', async () => {
    mockSignIn.mockResolvedValue('cred');
    expect(await load().login('e', 'p')).toBe('cred');
    expect(mockSignIn).toHaveBeenCalledWith(mockAuth, 'e', 'p');
  });

  it('logout clears the server session then signs out', async () => {
    fetchMock.mockResolvedValue(okResponse());
    mockSignOut.mockResolvedValue('done');
    expect(await load().logout()).toBe('done');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', { method: 'DELETE' });
  });

  it('onAuthChange subscribes with the auth instance', () => {
    const cb = jest.fn();
    mockOnAuthStateChanged.mockReturnValue('unsub');
    expect(load().onAuthChange(cb)).toBe('unsub');
    expect(mockOnAuthStateChanged).toHaveBeenCalledWith(mockAuth, cb);
  });

  it('resetPassword delegates', async () => {
    mockSendReset.mockResolvedValue(undefined);
    await load().resetPassword('a@b.c');
    expect(mockSendReset).toHaveBeenCalledWith(mockAuth, 'a@b.c');
  });

  describe('cleanupStudentData', () => {
    it('requires a signed in user', async () => {
      await expect(load().cleanupStudentData('s1')).rejects.toThrow('Sign in first');
    });
    it('posts the cleanup request with defaults', async () => {
      mockAuth.currentUser = { uid: 'u', getIdToken: jest.fn().mockResolvedValue('tok') };
      fetchMock.mockResolvedValue(okResponse());
      await load().cleanupStudentData('s1', 'c1');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/teacher/students/cleanup');
      expect(JSON.parse(init.body)).toEqual({ studentId: 's1', courseId: 'c1', unlink: false });
      expect(init.headers.Authorization).toBe('Bearer tok');
    });
    it('throws the API error or a default', async () => {
      mockAuth.currentUser = { uid: 'u', getIdToken: jest.fn().mockResolvedValue('tok') };
      const m = load();
      fetchMock.mockResolvedValueOnce(failResponse({ error: 'Nope' }));
      await expect(m.cleanupStudentData('s1', undefined, true)).rejects.toThrow('Nope');
      fetchMock.mockResolvedValueOnce(failResponse({}));
      await expect(m.cleanupStudentData('s1')).rejects.toThrow('Cleanup failed');
    });
  });

  describe('deleteFullAccount', () => {
    it('rejects when not signed in as that uid', async () => {
      const m = load();
      await expect(m.deleteFullAccount('u1', 'student')).rejects.toThrow('Sign in to delete your account');
      mockAuth.currentUser = { uid: 'other', getIdToken: jest.fn() };
      await expect(m.deleteFullAccount('u1', 'student')).rejects.toThrow('Sign in to delete your account');
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it('deletes the account then logs out', async () => {
      mockAuth.currentUser = { uid: 'u1', getIdToken: jest.fn().mockResolvedValue('tok') };
      fetchMock.mockResolvedValue(okResponse());
      mockSignOut.mockResolvedValue(undefined);
      await load().deleteFullAccount('u1', 'student');
      expect(fetchMock.mock.calls[0][0]).toBe('/api/account');
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
      expect(fetchMock.mock.calls[1]).toEqual(['/api/auth/session', { method: 'DELETE' }]);
      expect(mockSignOut).toHaveBeenCalled();
    });
    it('throws the API error and does not log out', async () => {
      mockAuth.currentUser = { uid: 'u1', getIdToken: jest.fn().mockResolvedValue('tok') };
      fetchMock.mockResolvedValue(failResponse({ error: 'Denied' }));
      await expect(load().deleteFullAccount('u1', 'student')).rejects.toThrow('Denied');
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe('changeEmail / changePassword', () => {
    it('throw when no user is logged in', async () => {
      const m = load();
      await expect(m.changeEmail('x@y.z')).rejects.toThrow('No user logged in');
      await expect(m.changePassword('pw')).rejects.toThrow('No user logged in');
    });
    it('delegate to the SDK for the current user', async () => {
      const user = { uid: 'u', getIdToken: jest.fn() };
      mockAuth.currentUser = user;
      const m = load();
      await m.changeEmail('x@y.z');
      await m.changePassword('newpw');
      expect(mockUpdateEmail).toHaveBeenCalledWith(user, 'x@y.z');
      expect(mockUpdatePassword).toHaveBeenCalledWith(user, 'newpw');
    });
  });
});

describe('updateUserProfile', () => {
  it('merges data into users/{uid}', async () => {
    mockSetDoc.mockResolvedValue(undefined);
    await load().updateUserProfile('u1', { displayName: 'New' });
    expect(mockDocFn).toHaveBeenCalledWith(mockDb, 'users', 'u1');
    expect(mockSetDoc).toHaveBeenCalledWith({ path: 'users/u1' }, { displayName: 'New' }, { merge: true });
  });
  it('logs and rethrows failures', async () => {
    const err = new Error('write failed');
    mockSetDoc.mockRejectedValue(err);
    await expect(load().updateUserProfile('u1', {})).rejects.toBe(err);
    expect(console.error).toHaveBeenCalledWith('Error updating user profile:', err);
  });
});

describe('signInWithGoogleForTeacher', () => {
  it('returns the user for an existing teacher profile and requests the forms scope', async () => {
    const user = { uid: 'u1' };
    mockSignInWithPopup.mockResolvedValue({ user });
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'teacher' }) });
    expect(await load().signInWithGoogleForTeacher()).toBe(user);
    expect(mockAddScope).toHaveBeenCalledWith('https://www.googleapis.com/auth/forms.body.readonly');
    expect(mockSignOut).not.toHaveBeenCalled();
  });
  it.each([
    ['missing profile', { exists: () => false, data: () => undefined }],
    ['non-teacher profile', { exists: () => true, data: () => ({ role: 'student' }) }],
  ])('signs out and rejects for a %s', async (_n, snap) => {
    mockSignInWithPopup.mockResolvedValue({ user: { uid: 'u1' } });
    mockGetDoc.mockResolvedValue(snap);
    await expect(load().signInWithGoogleForTeacher()).rejects.toThrow('teacher invite code');
    expect(mockSignOut).toHaveBeenCalledWith(mockAuth);
  });
});

describe('convertFilesToBase64', () => {
  class FakeReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    static fail = false;
    readAsDataURL(file: { name: string }) {
      if (FakeReader.fail) { this.onerror?.(new Error('read fail')); return; }
      this.result = `data:fake;${file.name}`;
      this.onload?.();
    }
  }
  beforeEach(() => { g.FileReader = FakeReader; FakeReader.fail = false; });

  it('converts each file to a data URL entry', async () => {
    const files = [{ name: 'a.txt', type: 'text/plain', size: 3 }, { name: 'b.png', type: 'image/png', size: 9 }] as unknown as File[];
    const out = await load().convertFilesToBase64(files);
    expect(out.map(o => [o.name, o.type, o.size, o.url])).toEqual([
      ['a.txt', 'text/plain', 3, 'data:fake;a.txt'],
      ['b.png', 'image/png', 9, 'data:fake;b.png'],
    ]);
    expect(out[0].uploadedAt).toBeInstanceOf(Date);
  });
  it('rejects when reading fails', async () => {
    FakeReader.fail = true;
    await expect(load().convertFilesToBase64([{ name: 'a' } as unknown as File])).rejects.toThrow('read fail');
  });
});

describe('compressImage', () => {
  type Img = { width: number; height: number; onload: () => void; onerror: () => void; src: string };
  let imgs: Img[];
  let drawImage: jest.Mock;
  let canvas: { width: number; height: number; getContext: jest.Mock; toBlob: jest.Mock };

  beforeEach(() => {
    imgs = [];
    drawImage = jest.fn();
    canvas = { width: 0, height: 0, getContext: jest.fn(() => ({ drawImage })), toBlob: jest.fn() };
    g.document = { createElement: jest.fn(() => canvas) };
    g.Image = function (this: Img) { this.width = 4000; this.height = 2000; imgs.push(this); };
    URL.createObjectURL = jest.fn(() => 'blob:x');
    g.File = class { constructor(public parts: unknown[], public name: string, public opts: { type: string }) {} };
  });

  const file = { name: 'p.png', type: 'image/png', size: 10 } as unknown as File;

  it('downsizes landscape images to maxWidth preserving aspect ratio', async () => {
    canvas.toBlob.mockImplementation((cb: (b: unknown) => void) => cb({}));
    const p = load().compressImage(file);
    imgs[0].onload();
    const out = (await p) as unknown as { name: string; opts: { type: string } };
    expect([canvas.width, canvas.height]).toEqual([1920, 960]);
    expect(drawImage).toHaveBeenCalledWith(imgs[0], 0, 0, 1920, 960);
    expect(out.name).toBe('p.png');
    expect(out.opts.type).toBe('image/png');
    expect(canvas.toBlob.mock.calls[0][1]).toBe('image/png');
    expect(canvas.toBlob.mock.calls[0][2]).toBe(0.8);
  });

  it('downsizes portrait images to maxHeight', async () => {
    canvas.toBlob.mockImplementation((cb: (b: unknown) => void) => cb({}));
    const p = load().compressImage(file, 1920, 1000, 0.5);
    imgs[0].width = 1000; imgs[0].height = 4000;
    imgs[0].onload();
    await p;
    expect([canvas.width, canvas.height]).toEqual([250, 1000]);
  });

  it('keeps small images at their size', async () => {
    canvas.toBlob.mockImplementation((cb: (b: unknown) => void) => cb({}));
    const p = load().compressImage(file);
    imgs[0].width = 100; imgs[0].height = 50;
    imgs[0].onload();
    await p;
    expect([canvas.width, canvas.height]).toEqual([100, 50]);
    const q = load().compressImage(file);
    imgs[1].width = 50; imgs[1].height = 100;
    imgs[1].onload();
    await q;
    expect([canvas.width, canvas.height]).toEqual([50, 100]);
  });

  it('rejects when the canvas yields no blob', async () => {
    canvas.toBlob.mockImplementation((cb: (b: unknown) => void) => cb(null));
    const p = load().compressImage(file);
    imgs[0].onload();
    await expect(p).rejects.toThrow('Failed to compress image');
  });

  it('rejects when the image fails to load', async () => {
    const p = load().compressImage(file);
    imgs[0].onerror();
    await expect(p).rejects.toThrow('Failed to load image');
  });

  it('still works without a 2d context', async () => {
    canvas.getContext.mockReturnValue(null);
    canvas.toBlob.mockImplementation((cb: (b: unknown) => void) => cb({}));
    const p = load().compressImage(file);
    imgs[0].onload();
    await expect(p).resolves.toBeDefined();
    expect(drawImage).not.toHaveBeenCalled();
  });
});

describe('uploadFilesToStorage', () => {
  type Handlers = { next: (s: { bytesTransferred: number; totalBytes: number }) => void; error: (e: Error) => void; done: () => Promise<void> };
  let handlers: Handlers[];
  beforeEach(() => {
    handlers = [];
    jest.spyOn(Date, 'now').mockReturnValue(1700);
    mockUploadResumable.mockImplementation(() => ({
      snapshot: { ref: { id: 'snap-ref' } },
      on: (_evt: string, next: Handlers['next'], error: Handlers['error'], done: Handlers['done']) => { handlers.push({ next, error, done }); },
    }));
    mockGetDownloadURL.mockResolvedValue('https://dl/url');
  });

  const nonImage = (name: string, size = 5) => ({ name, type: 'application/pdf', size }) as unknown as File;
  const tick = () => new Promise(r => setImmediate(r));

  it('uploads a non-image file under a timestamped path with progress and resolves metadata', async () => {
    const progress = jest.fn();
    const p = load().uploadFilesToStorage([nonImage('my.report.pdf', 1234)], 'u1', progress);
    await tick();
    expect(mockRef).toHaveBeenCalledWith(mockStorage, 'submissions/u1/1700_my.report.pdf');
    handlers[0].next({ bytesTransferred: 50, totalBytes: 100 });
    await handlers[0].done();
    const [out] = await p;
    expect(progress).toHaveBeenNthCalledWith(1, 0, 60);
    expect(progress).toHaveBeenLastCalledWith(0, 100);
    expect(out).toMatchObject({ name: 'my.report.pdf', type: 'application/pdf', size: 1234, url: 'https://dl/url' });
    expect(mockGetDownloadURL).toHaveBeenCalledWith({ id: 'snap-ref' });
  });

  it('uses the supplied base path', async () => {
    const p = load().uploadFilesToStorage([nonImage('a.pdf')], 'u1', undefined, 'resources');
    await tick();
    expect(mockRef.mock.calls[0][1]).toBe('resources/u1/1700_a.pdf');
    await handlers[0].done();
    await p;
  });

  it('rejects when the upload task errors', async () => {
    const p = load().uploadFilesToStorage([nonImage('a.pdf')], 'u1');
    await tick();
    handlers[0].error(new Error('quota'));
    await expect(p).rejects.toThrow('quota');
  });

  it('rejects when fetching the download URL fails', async () => {
    mockGetDownloadURL.mockRejectedValue(new Error('no url'));
    const p = load().uploadFilesToStorage([nonImage('a.pdf')], 'u1');
    await tick();
    await handlers[0].done();
    await expect(p).rejects.toThrow('no url');
  });

  describe('image compression', () => {
    let canvas: { width: number; height: number; getContext: jest.Mock; toBlob: jest.Mock };
    let imgCalls: Array<{ width: number; height: number }>;
    beforeEach(() => {
      imgCalls = [];
      canvas = { width: 0, height: 0, getContext: jest.fn(() => ({ drawImage: jest.fn() })), toBlob: jest.fn() };
      g.document = { createElement: jest.fn(() => canvas) };
      g.Image = function (this: { width: number; height: number; onload: () => void; onerror: () => void; set src(v: string) } ) {
        this.width = 5000; this.height = 5000;
        imgCalls.push(this);
        Object.defineProperty(this, 'src', { set: () => { setImmediate(() => this.onload()); } });
      };
      URL.createObjectURL = jest.fn(() => 'blob:x');
      g.File = class { size = 77; constructor(public parts: unknown[], public name: string, public opts: { type: string }) {} };
      canvas.toBlob.mockImplementation((cb: (b: unknown) => void) => cb({}));
    });
    const img = (size: number) => ({ name: 'pic.jpg', type: 'image/jpeg', size }) as unknown as File;

    it.each([
      ['small', 500 * 1024, 0.8, 1080],
      ['medium (>1MB)', 1.5 * 1024 * 1024, 0.7, 1000],
      ['large (>2MB)', 3 * 1024 * 1024, 0.6, 900],
    ])('compresses %s images with tiered settings', async (_n, size, quality, maxSide) => {
      const progress = jest.fn();
      const p = load().uploadFilesToStorage([img(size)], 'u1', progress);
      await new Promise(r => setTimeout(r, 10));
      await handlers[0].done();
      const [out] = await p;
      expect(canvas.toBlob.mock.calls[0][2]).toBe(quality);
      expect([canvas.width, canvas.height]).toEqual([maxSide, maxSide]);
      expect(out.size).toBe(77);
      expect(out.name).toBe('pic.jpg');
      expect(progress).toHaveBeenCalledWith(0, 10);
      expect(progress).toHaveBeenCalledWith(0, 20);
    });

    it('falls back to the original file when compression fails', async () => {
      canvas.toBlob.mockImplementation((cb: (b: unknown) => void) => cb(null));
      const p = load().uploadFilesToStorage([img(1000)], 'u1');
      await new Promise(r => setTimeout(r, 10));
      await handlers[0].done();
      const [out] = await p;
      expect(out.size).toBe(1000);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to compress pic.jpg'), expect.any(Error));
    });
  });
});
