import {
  connectClientEmulators,
  isEmulatorModeEnabled,
  planAdminInit,
} from "@/lib/firebase-emulator";

const services = { auth: {} as never, db: {} as never, storage: {} as never };
const makeConnectors = () => ({
  connectAuthEmulator: jest.fn(),
  connectFirestoreEmulator: jest.fn(),
  connectStorageEmulator: jest.fn(),
});

describe("client emulator wiring (L-012)", () => {
  it.each([undefined, "", "false", "1", "TRUE"])("does not connect when flag is %p", (flag) => {
    const c = makeConnectors();
    expect(connectClientEmulators(flag, services, c)).toBe(false);
    expect(c.connectAuthEmulator).not.toHaveBeenCalled();
    expect(c.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(c.connectStorageEmulator).not.toHaveBeenCalled();
  });

  it("connects auth, firestore and storage to the default ports when flag is 'true'", () => {
    const c = makeConnectors();
    expect(connectClientEmulators("true", services, c)).toBe(true);
    expect(c.connectAuthEmulator).toHaveBeenCalledWith(services.auth, "http://127.0.0.1:9099", { disableWarnings: true });
    expect(c.connectFirestoreEmulator).toHaveBeenCalledWith(services.db, "127.0.0.1", 8080);
    expect(c.connectStorageEmulator).toHaveBeenCalledWith(services.storage, "127.0.0.1", 9199);
  });

  it("only treats the exact string 'true' as enabled", () => {
    expect(isEmulatorModeEnabled("true")).toBe(true);
    expect(isEmulatorModeEnabled(undefined)).toBe(false);
  });
});

describe("src/lib/firebase.ts with the flag off", () => {
  const original = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS;
    else process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = original;
    jest.resetModules();
  });

  async function loadWithMocks(flag: string | undefined) {
    if (flag === undefined) delete process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS;
    else process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = flag;
    jest.resetModules();
    const mocks = {
      initializeApp: jest.fn(() => ({ name: "app" })),
      getAuth: jest.fn(() => ({ kind: "auth" })),
      getFirestore: jest.fn(() => ({ kind: "db" })),
      getStorage: jest.fn(() => ({ kind: "storage" })),
      connectAuthEmulator: jest.fn(),
      connectFirestoreEmulator: jest.fn(),
      connectStorageEmulator: jest.fn(),
    };
    jest.doMock("firebase/app", () => ({ initializeApp: mocks.initializeApp, getApps: () => [] }));
    jest.doMock("firebase/app-check", () => ({
      initializeAppCheck: jest.fn(),
      ReCaptchaEnterpriseProvider: jest.fn(),
      ReCaptchaV3Provider: jest.fn(),
      getToken: jest.fn(),
    }));
    jest.doMock("firebase/auth", () => ({
      getAuth: mocks.getAuth,
      connectAuthEmulator: mocks.connectAuthEmulator,
    }));
    jest.doMock("firebase/firestore", () => ({
      getFirestore: mocks.getFirestore,
      connectFirestoreEmulator: mocks.connectFirestoreEmulator,
    }));
    jest.doMock("firebase/storage", () => ({
      getStorage: mocks.getStorage,
      connectStorageEmulator: mocks.connectStorageEmulator,
    }));
    jest.doMock("firebase/ai", () => ({ getAI: jest.fn(), GoogleAIBackend: jest.fn() }));
    await import("@/lib/firebase");
    return mocks;
  }

  it("initialises and calls no connect*Emulator when the flag is unset", async () => {
    const m = await loadWithMocks(undefined);
    expect(m.initializeApp).toHaveBeenCalledTimes(1);
    expect(m.getAuth).toHaveBeenCalled();
    expect(m.connectAuthEmulator).not.toHaveBeenCalled();
    expect(m.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(m.connectStorageEmulator).not.toHaveBeenCalled();
  });

  it("calls no connect*Emulator when the flag is 'false'", async () => {
    const m = await loadWithMocks("false");
    expect(m.connectAuthEmulator).not.toHaveBeenCalled();
  });

  it("connects all three emulators when the flag is 'true'", async () => {
    const m = await loadWithMocks("true");
    expect(m.connectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(m.connectFirestoreEmulator).toHaveBeenCalledTimes(1);
    expect(m.connectStorageEmulator).toHaveBeenCalledTimes(1);
  });
});

describe("planAdminInit (firebase-admin credentials)", () => {
  const prod = {
    FIREBASE_PROJECT_ID: "prod-project",
    FIREBASE_CLIENT_EMAIL: "sa@prod-project.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: '"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"',
  };

  it("uses cert credentials when no emulator host is set (unchanged production path)", () => {
    const plan = planAdminInit(prod);
    expect(plan).toEqual({
      mode: "cert",
      projectId: "prod-project",
      clientEmail: prod.FIREBASE_CLIENT_EMAIL,
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    });
  });

  it("reports missing credentials when unset and no emulator", () => {
    expect(planAdminInit({})).toEqual({
      mode: "missing",
      hasProjectId: false,
      hasClientEmail: false,
      hasPrivateKey: false,
    });
  });

  it("ignores empty emulator host strings", () => {
    expect(planAdminInit({ ...prod, FIRESTORE_EMULATOR_HOST: "", FIREBASE_AUTH_EMULATOR_HOST: "" }).mode).toBe("cert");
  });

  it.each(["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"])(
    "skips cert and defaults the project id when %s is set",
    (host) => {
      expect(planAdminInit({ [host]: "127.0.0.1:1234" })).toEqual({ mode: "emulator", projectId: "demo-scorpio" });
    }
  );

  it("keeps a configured project id in emulator mode, even with dummy keys", () => {
    const plan = planAdminInit({
      FIREBASE_PROJECT_ID: "demo-x",
      FIREBASE_PRIVATE_KEY: "dummy",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    });
    expect(plan).toEqual({ mode: "emulator", projectId: "demo-x" });
  });
});
