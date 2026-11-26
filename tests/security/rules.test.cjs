const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } = require('firebase/firestore');
const fs = require('node:fs');
const {ref,uploadBytes,getBytes}=require('firebase/storage');
let env;
beforeAll(async () => {
 env = await initializeTestEnvironment({ projectId: 'demo-scorpio-security', firestore: { host: '127.0.0.1', port: Number((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8188').split(':').pop()), rules: fs.readFileSync('firestore.rules','utf8') }, storage: {host:'127.0.0.1',port:Number((process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9298').split(':').pop()),rules:fs.readFileSync('storage.rules','utf8')} });
 await env.withSecurityRulesDisabled(async ctx => {
  const db=ctx.firestore();
  const docs={
   'users/ta':{role:'teacher',organizationId:'a'}, 'users/tb':{role:'teacher',organizationId:'b'},
   'users/sa':{role:'student',teacherId:'ta',courseId:'ca',organizationId:'a'},'users/sb':{role:'student',teacherId:'tb',courseId:'cb',organizationId:'b'},
   'organizations/a':{ownerId:'ta',planId:'free'}, 'organizations/b':{ownerId:'tb'},
   'users/tp':{role:'teacher',organizationId:'p'}, 'organizations/p':{ownerId:'tp',planId:'pilot',aiBudgetLimit:1000,aiBonusCents:1000,aiPaidCents:0,pilot:{status:'active'}}, 'organizations/p/credit_ledger/l1':{kind:'admin',bucket:'bonus',cents:1000},
   'courses/ca':{teacherId:'ta',organizationId:'a'},'courses/cb':{teacherId:'tb',organizationId:'b'},
   'assignments/aa':{teacherId:'ta',courseId:'ca',organizationId:'a',visibility:'private',answerKeySeparated:true,questions:[]},
   'assignments/legacy':{teacherId:'ta',courseId:'ca',organizationId:'a',visibility:'private',questions:[{correctAnswer:'secret'}]},
   'assignment_keys/aa':{teacherId:'ta',answers:{q:'secret'}},
   'submissions/suba':{studentId:'sa',assignmentId:'aa',teacherId:'ta',status:'submitted',graded:false},
   'notebooks/na':{studentId:'sa'}, 'tutor_sessions/sa':{studentId:'sa'},
   'portfolios/sa':{studentId:'sa',teacherId:'ta',organizationId:'a'},
   'study_progress/sa':{studentId:'sa',problems:{},review:{},misconceptions:{},days:[],shareToken:'tok'},
   'study_shares/tok':{studentId:'sa',name:'S'}
  };
  await Promise.all(Object.entries(docs).map(([path,data])=>setDoc(doc(db,path),data)));
 });
},30000);
afterAll(async()=>{await env?.cleanup()});
const db = id => env.authenticatedContext(id).firestore();
test('unauthenticated users cannot read student records',async()=>assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'users/sa'))));
test('a fresh account cannot create a teacher profile',async()=>assertFails(setDoc(doc(db('new'),'users/new'),{role:'teacher'})));
test('student cannot self-promote, change school, or reset usage',async()=>{
 for(const change of [{role:'teacher'},{organizationId:'b'},{teacherId:'tb'},{tutorUsageCurrent:0}]) await assertFails(updateDoc(doc(db('sa'),'users/sa'),change));
});
test('teacher can read own students and their submissions',async()=>{
 await assertSucceeds(getDoc(doc(db('ta'),'users/sa')));
 await assertSucceeds(getDocs(query(collection(db('ta'),'users'),where('teacherId','==','ta'),where('role','==','student'))));
 await assertSucceeds(getDocs(query(collection(db('ta'),'submissions'),where('assignmentId','==','aa'))));
});
test('teacher cannot cross school boundaries',async()=>{
 for(const path of ['users/sa','submissions/suba','portfolios/sa','courses/ca','assignment_keys/aa']) await assertFails(getDoc(doc(db('tb'),path)));
 await assertFails(updateDoc(doc(db('tb'),'courses/ca'),{name:'hijack'}));
});
test('student can read sanitized assignment but not keys or legacy answer documents',async()=>{
 await assertSucceeds(getDoc(doc(db('sa'),'assignments/aa')));
 await assertFails(getDoc(doc(db('sa'),'assignment_keys/aa')));
 await assertFails(getDoc(doc(db('sa'),'assignments/legacy')));
});
test('student cannot forge grading fields or create submissions directly',async()=>{
 await assertFails(updateDoc(doc(db('sa'),'submissions/suba'),{graded:true,earnedPoints:100}));
 await assertFails(setDoc(doc(db('sa'),'submissions/fake'),{studentId:'sa',score:100}));
});
test('student cannot take ownership of another notebook or tutor session',async()=>{
 await assertFails(setDoc(doc(db('sb'),'notebooks/na'),{studentId:'sb'}));
 await assertFails(setDoc(doc(db('sb'),'tutor_sessions/sa'),{studentId:'sb'}));
});
test('study progress: a student reads only their own, and no client writes it or its share links',async()=>{
 await assertSucceeds(getDoc(doc(db('sa'),'study_progress/sa')));
 for (const who of ['sb','ta']) await assertFails(getDoc(doc(db(who),'study_progress/sa')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'study_progress/sa')));
 await assertFails(setDoc(doc(db('sa'),'study_progress/sa'),{studentId:'sa',problems:{x:{correct:true}}}));
 await assertFails(setDoc(doc(db('sb'),'study_progress/sb'),{studentId:'sb'}));
 for (const who of ['sa','ta']) await assertFails(getDoc(doc(db(who),'study_shares/tok')));
 await assertFails(setDoc(doc(db('sa'),'study_shares/new'),{studentId:'sa'}));
});
test('owner can change display settings but cannot forge subscription or usage',async()=>{
 await assertSucceeds(updateDoc(doc(db('ta'),'organizations/a'),{name:'Physics'}));
 await assertFails(updateDoc(doc(db('ta'),'organizations/a'),{planId:'paid',aiUsageCurrent:0}));
});

// aiBudgetLimit is the owner's own monthly spend cap (0 = none) on their own balance, so they may
// raise or lower it. What they cannot do is add credit, clear spend or edit the pilot record.
test('owner sets their spend cap but cannot add credit, clear spend or edit the pilot record',async()=>{
 await assertSucceeds(updateDoc(doc(db('tp'),'organizations/p'),{aiBudgetLimit:500}));
 await assertSucceeds(updateDoc(doc(db('tp'),'organizations/p'),{aiBudgetLimit:5000}));
 await assertSucceeds(updateDoc(doc(db('tp'),'organizations/p'),{aiBudgetLimit:0}));
 await assertFails(updateDoc(doc(db('tp'),'organizations/p'),{aiBudgetLimit:-1}));
 await assertFails(updateDoc(doc(db('tp'),'organizations/p'),{aiBudgetLimit:'999'}));
 for (const field of ['aiPaidCents','aiBonusCents','aiBonusExpiresAt','aiFreeUsedCents','aiFreeMonth','aiUsageCurrent','aiUsageMonth','aiUsageReserved'])
  await assertFails(updateDoc(doc(db('tp'),'organizations/p'),{[field]:field==='aiFreeMonth'||field==='aiUsageMonth'?'2000-01':999999}));
 await assertFails(updateDoc(doc(db('tp'),'organizations/p'),{pilot:{status:'active',endsAt:null}}));
 await assertFails(updateDoc(doc(db('ta'),'organizations/p'),{aiBudgetLimit:0}));
});
test('credit ledger: network teachers read it, nobody writes it, other networks cannot see it',async()=>{
 await assertSucceeds(getDoc(doc(db('tp'),'organizations/p/credit_ledger/l1')));
 await assertFails(getDoc(doc(db('ta'),'organizations/p/credit_ledger/l1')));
 await assertFails(setDoc(doc(db('tp'),'organizations/p/credit_ledger/forged'),{kind:'deposit',bucket:'paid',cents:100000}));
 await assertFails(updateDoc(doc(db('tp'),'organizations/p/credit_ledger/l1'),{cents:999999}));
});

test('student assignment queries remain valid with sanitized marker',async()=>{
 await assertSucceeds(getDocs(query(collection(db('sa'),'assignments'),where('courseId','==','ca'),where('answerKeySeparated','==',true))));
});
test('network portfolio queries remain authorized only for the owning network',async()=>{
 await assertSucceeds(getDocs(query(collection(db('ta'),'portfolios'),where('studentId','in',['sa']))));
 await assertFails(getDocs(query(collection(db('tb'),'portfolios'),where('studentId','in',['sa']))));
});
test('storage accepts own work, rejects other students and unrelated teachers',async()=>{
 const storage=env.authenticatedContext('sa').storage();
 await assertSucceeds(uploadBytes(ref(storage,'submissions/sa/work.txt'),new TextEncoder().encode('physics'),{contentType:'text/plain'}));
 await assertSucceeds(getBytes(ref(env.authenticatedContext('ta').storage(),'submissions/sa/work.txt')));
 await assertFails(getBytes(ref(env.authenticatedContext('tb').storage(),'submissions/sa/work.txt')));
 await assertFails(uploadBytes(ref(env.authenticatedContext('sb').storage(),'submissions/sa/fake.txt'),new TextEncoder().encode('fake'),{contentType:'text/plain'}));
});
