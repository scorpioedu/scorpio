# Running Scorpio against the Firebase Emulators (RT-22 part 1)

No production Firebase, Polar, Gemini or email access is needed. Requires Node 22 (`nvm use`), Java 17+ and `firebase-tools`.

## 1. Start the emulators

```bash
npm run dev:emulators
```

Ports (from `firebase.json`): Auth 9099, Firestore 8080, Storage 9199, Emulator UI 4001. These avoid `firebase.test.json` (8188/9298) used by `npm run test:security`.

## 2. Env values for `.env.local`

Use demo values; none are secrets.

```
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-scorpio.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-scorpio
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-scorpio.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:demo
FIREBASE_PROJECT_ID=demo-scorpio
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

## 3. Run the app

```bash
npm run dev            # or: npx next dev --webpack -p 3100
```

## What the flags do

- `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` makes `src/lib/firebase.ts` call `connectAuthEmulator`, `connectFirestoreEmulator` and `connectStorageEmulator` (127.0.0.1) and skips App Check (reCAPTCHA). Any other value, or unset, leaves production behaviour unchanged. The value is inlined at build/start, so restart `next dev` after changing it.
- When `FIRESTORE_EMULATOR_HOST` or `FIREBASE_AUTH_EMULATOR_HOST` is set, `src/lib/firebase-admin.ts` initialises without `cert()` (no service-account key needed). Without them, the original credential path is used unchanged.

## Limitations

- Emulator data is empty and is lost on exit unless you use `--export-on-exit`.
- Not emulated: Gemini, Polar billing, Resend email. Features calling them will fail locally.
- The Functions emulator is not part of `dev:emulators`.
