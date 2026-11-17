// RT-14 (D-002, D-003, D-005, D-006): characterization of operations the client performs
// (must keep working) plus abuse cases the rules must deny. Also pins default-deny collections.
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import fs from 'node:fs';
let env: RulesTestEnvironment;
beforeAll(async () => {
 env = await initializeTestEnvironment({ projectId: 'demo-scorpio-security', firestore: { host: '127.0.0.1', port: Number((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8188').split(':').pop()), rules: fs.readFileSync('firestore.rules','utf8') }, storage: {host:'127.0.0.1',port:Number((process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9298').split(':').pop()),rules:fs.readFileSync('storage.rules','utf8')} });
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  const docs: Record<string, Record<string, unknown>> = {
   'users/ta':{role:'teacher',organizationId:'a',email:'ta@example.test'}, 'users/tb':{role:'teacher',organizationId:'b'},
   'users/sa':{role:'student',teacherId:'ta',courseId:'ca',organizationId:'a',email:'sa@example.test'},
   'users/sb':{role:'student',teacherId:'tb',courseId:'cb',organizationId:'b'},
   'courses/ca':{teacherId:'ta',organizationId:'a'},
   'assignments/own':{teacherId:'ta',courseId:'ca',organizationId:'a',visibility:'private',answerKeySeparated:true,title:'t'},
   'assignments/del':{teacherId:'ta',visibility:'private',answerKeySeparated:true},
   'notebooks/seeded':{studentId:'sa',title:'x',content:'y'},
   'notebooks/sb':{studentId:'sa',title:'squat',content:'payload'},
   'tutor_sessions/seeded':{studentId:'sa',title:'x',messages:[]},
   'tutor_sessions/sb':{studentId:'sa',title:'squat',messages:[]},
   'admin_audit/x':{a:1}, 'landing_daily/x':{a:1}, 'landing_visitors/x':{a:1}, 'ai_reservations/x':{a:1}, 'grading_locks/x':{a:1}, 'support_tickets/x':{a:1}
  };
  await Promise.all(Object.entries(docs).map(([p,d])=>setDoc(doc(db,p),d)));
 });
},30000);
afterAll(async()=>{await env.cleanup()});
const db = (id: string, extra?: { email: string }) => env.authenticatedContext(id, extra).firestore();
const fx = (id: string) => env.authenticatedContext(id).storage();
const bytes = (s: string) => new TextEncoder().encode(s);

describe('assignments (D-002)', () => {
 test('owner can delete own assignment (characterization)', async () => assertSucceeds(deleteDoc(doc(db('ta'),'assignments/del'))));
 test('owner can set visibility to private/network/global', async () => {
  for (const v of ['network','global','private']) await assertSucceeds(updateDoc(doc(db('ta'),'assignments/own'),{visibility:v}));
 });
 test('owner cannot change anything but visibility', async () => {
  for (const c of [{teacherId:'tb'},{title:'x'},{answerKeySeparated:false},{visibility:'public'},{visibility:'global',title:'x'}]) await assertFails(updateDoc(doc(db('ta'),'assignments/own'),c));
 });
 test('other teachers and students cannot change visibility', async () => {
  await assertFails(updateDoc(doc(db('tb'),'assignments/own'),{visibility:'global'}));
  await assertFails(updateDoc(doc(db('sa'),'assignments/own'),{visibility:'global'}));
 });
 test('clients still cannot create assignments', async () => assertFails(setDoc(doc(db('ta'),'assignments/new'),{teacherId:'ta',visibility:'private'})));
});

describe.each<[string, Record<string, unknown>, Record<string, unknown>]>([
 ['notebooks', {title:'T',content:'C',messages:[]}, {content:'C2',title:'T2',messages:[{role:'user',content:'hi'}]}],
 ['tutor_sessions', {title:'T',messages:[]}, {messages:[{id:'1',role:'user',content:'hi'}],title:'T2'}],
])('%s (D-003)', (col, base, patch) => {
 const now = () => new Date();
 test('student can create with auto id, list own, update, rename and delete (characterization)', async () => {
  const s = db('sa');
  const r = await addDoc(collection(s,col),{...base,studentId:'sa',createdAt:now(),updatedAt:now()});
  await assertSucceeds(getDocs(query(collection(s,col),where('studentId','==','sa'))));
  await assertSucceeds(getDoc(r));
  await assertSucceeds(updateDoc(r,{...patch,updatedAt:now()}));
  await assertSucceeds(deleteDoc(r));
 });
 test('new user probing for a legacy doc at their own uid gets "not found", not an error (characterization)', async () => {
  const snap = await assertSucceeds(getDoc(doc(db('fresh'),`${col}/fresh`)));
  expect(snap.exists()).toBe(false);
 });
 test('student cannot create a doc with another studentId or at another user id', async () => {
  await assertFails(setDoc(doc(db('sb'),`${col}/new1`),{...base,studentId:'sa'}));
  await assertFails(setDoc(doc(db('sa'),`${col}/ta`),{...base,studentId:'sa'}));
  await assertFails(setDoc(doc(db('sa'),`${col}/tb`),{...base,studentId:'sa'}));
 });
 test('a doc squatted at a victim uid cannot be read or deleted by the victim via id match', async () => {
  await assertFails(getDoc(doc(db('sb'),`${col}/sb`)));
  await assertFails(deleteDoc(doc(db('sb'),`${col}/sb`)));
 });
 test('create rejects unknown keys, oversize or wrong-typed fields', async () => {
  const s = db('sa');
  await assertFails(addDoc(collection(s,col),{...base,studentId:'sa',role:'teacher'}));
  await assertFails(addDoc(collection(s,col),{...base,studentId:'sa',title:'x'.repeat(1000)}));
  await assertFails(addDoc(collection(s,col),{...base,studentId:'sa',messages:'nope'}));
  if (col === 'notebooks') await assertFails(addDoc(collection(s,col),{...base,studentId:'sa',content:'x'.repeat(600000)}));
 });
 test('update cannot change owner or add unknown keys, and others cannot update', async () => {
  await assertFails(updateDoc(doc(db('sa'),`${col}/seeded`),{studentId:'sb'}));
  await assertFails(updateDoc(doc(db('sa'),`${col}/seeded`),{extra:1}));
  await assertFails(updateDoc(doc(db('sb'),`${col}/seeded`),{title:'hijack'}));
  await assertFails(deleteDoc(doc(db('sb'),`${col}/seeded`)));
  await assertFails(getDoc(doc(db('sb'),`${col}/seeded`)));
 });
});

describe('users (D-005)', () => {
 test('user can update display fields and preferences (characterization)', async () => {
  await assertSucceeds(updateDoc(doc(db('sa'),'users/sa'),{displayName:'Sam'}));
  await assertSucceeds(setDoc(doc(db('sa'),'users/sa'),{preferences:{autoRedirectPortal:true}},{merge:true}));
 });
 test('user may set email only to their verified auth email', async () => {
  const s = db('sa',{email:'sa@example.test'});
  await assertSucceeds(updateDoc(doc(s,'users/sa'),{email:'sa@example.test'}));
  await assertFails(updateDoc(doc(s,'users/sa'),{email:'victim@example.test'}));
  await assertFails(updateDoc(doc(db('sa'),'users/sa'),{email:'victim@example.test'}));
 });
});

describe('storage (D-006)', () => {
 test('student can upload own submission files (characterization)', async () =>
  assertSucceeds(uploadBytes(ref(fx('sa'),'submissions/sa/work.pdf'),bytes('x'),{contentType:'application/pdf'})));
 test('teacher can upload a video resource under resources/{uid}', async () => {
  await assertSucceeds(uploadBytes(ref(fx('ta'),'resources/ta/clip.mp4'),bytes('x'),{contentType:'video/mp4'}));
  await assertSucceeds(uploadBytes(ref(fx('ta'),'resources/ta/clip.webm'),bytes('x'),{contentType:'video/webm'}));
  await assertSucceeds(uploadBytes(ref(fx('ta'),'resources/ta/notes.pdf'),bytes('x'),{contentType:'application/pdf'}));
 });
 test('resource uploads reject executables, other teachers and students', async () => {
  await assertFails(uploadBytes(ref(fx('ta'),'resources/ta/a.exe'),bytes('x'),{contentType:'application/x-msdownload'}));
  await assertFails(uploadBytes(ref(fx('tb'),'resources/ta/clip.mp4'),bytes('x'),{contentType:'video/mp4'}));
  await assertFails(uploadBytes(ref(fx('sa'),'resources/ta/clip.mp4'),bytes('x'),{contentType:'video/mp4'}));
  await assertFails(uploadBytes(ref(fx('sa'),'resources/sa/clip.mp4'),bytes('x'),{contentType:'video/mp4'}));
 });
 test('submissions still reject video (students do not need it)', async () =>
  assertFails(uploadBytes(ref(fx('sa'),'submissions/sa/clip.mp4'),bytes('x'),{contentType:'video/mp4'})));
});

describe('server-only collections are client-inaccessible', () => {
 test.each(['admin_audit','landing_daily','landing_visitors','ai_reservations','grading_locks','support_tickets'])('%s denies read and write to teachers and students', async (c) => {
  for (const who of ['ta','sa']) {
   await assertFails(getDoc(doc(db(who),`${c}/x`)));
   await assertFails(setDoc(doc(db(who),`${c}/y`),{a:1}));
   await assertFails(updateDoc(doc(db(who),`${c}/x`),{a:2}));
   await assertFails(deleteDoc(doc(db(who),`${c}/x`)));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),`${c}/x`)));
 });
});

describe('courses follow a curriculum only through the server', () => {
 test('owner can still edit settings, but cannot set, change or clear curriculumId', async () => {
  await assertSucceeds(updateDoc(doc(db('ta'),'courses/ca'),{restrictedFormulaIds:['f1']}));
  await assertFails(updateDoc(doc(db('ta'),'courses/ca'),{curriculumId:'ap-physics-1'}));
  await env.withSecurityRulesDisabled(async ctx => { await updateDoc(doc(ctx.firestore(),'courses/ca'),{curriculumId:'ap-physics-1'}); });
  await assertSucceeds(updateDoc(doc(db('ta'),'courses/ca'),{restrictedFormulaIds:['f2']}));
  await assertFails(updateDoc(doc(db('ta'),'courses/ca'),{curriculumId:'other'}));
  await assertFails(updateDoc(doc(db('ta'),'courses/ca'),{curriculumId:null}));
  await env.withSecurityRulesDisabled(async ctx => { await updateDoc(doc(ctx.firestore(),'courses/ca'),{curriculumId:null}); });
 });
 test('owner cannot write the course plan or the school calendar directly', async () => {
  await assertFails(updateDoc(doc(db('ta'),'courses/ca'),{curriculumPlan:{order:['1A'],skipped:[]}}));
  await assertFails(updateDoc(doc(db('ta'),'courses/ca'),{daysOff:[]}));
  await env.withSecurityRulesDisabled(async ctx => { await updateDoc(doc(ctx.firestore(),'courses/ca'),{curriculumPlan:{order:['1A'],skipped:[]},daysOff:[{start:'2027-03-22',end:'2027-03-26',label:'Spring break'}]}); });
  // Other settings still save while a plan and calendar are stored; the stored values cannot be changed or removed.
  await assertSucceeds(updateDoc(doc(db('ta'),'courses/ca'),{restrictedFormulaIds:['f3']}));
  await assertFails(updateDoc(doc(db('ta'),'courses/ca'),{daysOff:[]}));
  await assertFails(updateDoc(doc(db('ta'),'courses/ca'),{curriculumPlan:deleteField()}));
  await env.withSecurityRulesDisabled(async ctx => { await updateDoc(doc(ctx.firestore(),'courses/ca'),{curriculumPlan:deleteField(),daysOff:deleteField()}); });
 });
 test('a student can read their own class (to group assignments by unit)', async () => assertSucceeds(getDoc(doc(db('sa'),'courses/ca'))));
});
