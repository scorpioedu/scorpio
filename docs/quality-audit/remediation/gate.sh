#!/usr/bin/env bash
# Regression Gate. Run from the root of any worktree of this repo: bash docs/quality-audit/remediation/gate.sh
# Exit non-zero on any failure. Never reads .env.local; uses dummy public Firebase values for the build.
# Env: GATE_PORT_OFFSET (shift emulator ports), GATE_NODE_BIN (default: nvm Node 22.22.0 bin), GATE_SKIP_BUILD=1 to skip build.
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
export PATH="${GATE_NODE_BIN:-$HOME/.nvm/versions/node/v22.22.0/bin}:$PATH"
HERE="docs/quality-audit/remediation"
OUT="${GATE_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"
FAIL=0
step() { echo "[gate] $1"; }
bad() { echo "[gate] FAIL: $1"; FAIL=1; }
echo "[gate] node $(node -v) in $ROOT; logs in $OUT"

step "tsc root";      npx --no-install tsc --noEmit > "$OUT/tsc-root.log" 2>&1 || bad "tsc root (see $OUT/tsc-root.log)"
step "tsc functions"; (cd functions && npx --no-install tsc --noEmit) > "$OUT/tsc-fn.log" 2>&1 || bad "tsc functions (see $OUT/tsc-fn.log)"

step "jest"
npx --no-install jest > "$OUT/jest.log" 2>&1 || bad "jest (see $OUT/jest.log)"

step "security (emulators)"
# Serialise emulator runs across worktrees (shared ports).
LOCK=/tmp/scorpio-gate-emulator.lock
until mkdir "$LOCK" 2>/dev/null; do sleep 5; done
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
CFG=firebase.test.json
if [ "${GATE_PORT_OFFSET:-0}" != "0" ]; then
  # Use shifted emulator ports (e.g. when an orphaned emulator holds the default ports).
  CFG=.firebase.gate.json
  node -e '
  const c=JSON.parse(require("fs").readFileSync("firebase.test.json","utf8"));const o=Number(process.argv[1]);
  for(const k of Object.keys(c.emulators)){if(c.emulators[k]&&c.emulators[k].port)c.emulators[k].port+=o}
  require("fs").writeFileSync(".firebase.gate.json",JSON.stringify(c))' "$GATE_PORT_OFFSET"
fi
firebase emulators:exec --only firestore,storage --project demo-scorpio-security --config "$CFG" \
  "npx --no-install jest --config jest.security.config.cjs --runInBand --json --outputFile=$OUT/security.json" > "$OUT/security.log" 2>&1
rmdir "$LOCK" 2>/dev/null; trap - EXIT
if [ ! -s "$OUT/security.json" ]; then bad "security produced no result (see $OUT/security.log)"; else
node -e '
const fs=require("fs");const r=JSON.parse(fs.readFileSync(process.argv[1]));
const exp=fs.readFileSync(process.argv[2],"utf8").split("\n").map(s=>s.trim()).filter(Boolean);
const failed=[];r.testResults.forEach(s=>{ if(s.status==="failed"&&s.assertionResults.length===0) failed.push("SUITE:"+s.name);
 s.assertionResults.filter(a=>a.status==="failed").forEach(a=>failed.push(a.title))});
const unexpected=failed.filter(t=>!exp.includes(t));
console.log("[gate] security: "+r.numPassedTests+" passed, "+failed.length+" failed ("+(failed.length-unexpected.length)+" expected)");
if(unexpected.length){console.log("[gate] unexpected failures:\n  "+unexpected.join("\n  "));process.exit(1)}
' "$OUT/security.json" "$HERE/expected-failures.txt" || bad "security tests"
fi

step "eslint counts"
npx --no-install eslint . --ignore-pattern ".next-gate/**" --ignore-pattern "coverage/**" -f json > "$OUT/eslint.json" 2> "$OUT/eslint.err"
node -e '
const fs=require("fs");const b=JSON.parse(fs.readFileSync(process.argv[2]));
let r;try{r=JSON.parse(fs.readFileSync(process.argv[1]))}catch(e){console.log("[gate] eslint output unparsable");process.exit(1)}
let e=0,w=0;r.forEach(f=>{e+=f.errorCount;w+=f.warningCount});
console.log("[gate] eslint errors="+e+" (max "+b.eslintErrors+") warnings="+w+" (max "+b.eslintWarnings+")");
if(e>b.eslintErrors||w>b.eslintWarnings)process.exit(1)
' "$OUT/eslint.json" "$HERE/baseline-counts.json" || bad "eslint counts rose"

if [ "${GATE_SKIP_BUILD:-0}" != "1" ]; then
  step "build"
  # next build rewrites tsconfig.json / next-env.d.ts when SCORPIO_BUILD_DIR is set; restore them afterwards.
  cp tsconfig.json "$OUT/tsconfig.json.bak"; cp next-env.d.ts "$OUT/next-env.d.ts.bak"
  NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-scorpio.firebaseapp.com \
  NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-scorpio NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-scorpio.appspot.com \
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000 NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:0000000000000000 \
  SCORPIO_BUILD_DIR=.next-gate npm run build > "$OUT/build.log" 2>&1 || bad "build (see $OUT/build.log)"
  cp "$OUT/tsconfig.json.bak" tsconfig.json; cp "$OUT/next-env.d.ts.bak" next-env.d.ts
fi

[ "$FAIL" = 0 ] && echo "[gate] PASS" || echo "[gate] FAILED"
exit $FAIL
