import * as admin from 'firebase-admin';
jest.mock('../../src/lib/firebase-admin',()=>{
 const admin=jest.requireActual<typeof import('firebase-admin')>('firebase-admin');if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Emulator required');
 if(!admin.apps.length)admin.initializeApp({projectId:'demo-scorpio-security'});return {adminDb:admin.firestore()};
});
jest.mock('@polar-sh/sdk/webhooks',()=>({validateEvent:(body:string)=>JSON.parse(body)}));
import {POST} from '../../src/app/api/webhooks/polar/route';
import {adminDb} from '../../src/lib/firebase-admin';

// Polar billing after #24: AI credit is bought as a one-off "ai_credit" order. order.paid adds the
// net amount minus Polar's fee to the paid bucket once per order; order.refunded removes the
// refunded share once per refund step. Legacy subscription events never touch balance or usage.
const ORG='billing-test';
const ref=()=>adminDb.collection('organizations').doc(ORG);
const ledger=async()=>(await ref().collection('credit_ledger').get()).docs.map(d=>d.data());
const post=(id:string,payload:object)=>POST(new Request('http://localhost/api/webhooks/polar',{method:'POST',headers:{'webhook-id':id},body:JSON.stringify(payload)}));
type Order={id?:string;paid?:boolean;netAmount?:number;platformFeeAmount?:number;refundedAmount?:number;metadata?:Record<string,string>};
const order=(type:string,o:Order={})=>post(`${type}-${Math.random()}`,{type,data:{id:'ord_1',paid:true,netAmount:1000,platformFeeAmount:50,currency:'usd',metadata:{kind:'ai_credit',organizationId:ORG,userId:'teacher'},...o}});
const subscription=(id:string,date:string,period:string)=>post(id,{type:'subscription.active',data:{id:'sub',customerId:'cust',status:'active',modifiedAt:date,currentPeriodStart:period,metadata:{organizationId:ORG,planId:'standard_monthly'}}});

beforeEach(async()=>{
 await adminDb.recursiveDelete(ref());
 await ref().set({ownerId:'teacher',aiPaidCents:0,aiUsageCurrent:12,aiUsageMonth:'2026-11'});
});
afterAll(async()=>{await Promise.all(admin.apps.filter(Boolean).map(app=>app!.delete()))});

test('order.paid credits the net amount minus the fee exactly once, however often it is delivered',async()=>{
 for(let i=0;i<3;i++)expect((await order('order.paid')).status).toBe(200);
 expect((await ref().get()).data()!.aiPaidCents).toBe(950);
 expect(await ledger()).toEqual([expect.objectContaining({kind:'deposit',bucket:'paid',cents:950})]);
});

test('order.created, unpaid orders, other products and bad org ids grant nothing',async()=>{
 await order('order.created');
 await order('order.paid',{paid:false});
 await order('order.paid',{id:'ord_2',metadata:{kind:'something_else',organizationId:ORG}});
 await order('order.paid',{id:'ord_3',metadata:{kind:'ai_credit',organizationId:`${ORG}/credit_ledger/x`}});
 await order('order.paid',{id:'ord_4',netAmount:40,platformFeeAmount:50});
 expect((await ref().get()).data()!.aiPaidCents).toBe(0);
 expect(await ledger()).toEqual([]);
});

test('refunds remove only the newly refunded share, once per step, and never more than was paid',async()=>{
 await order('order.paid');
 await order('order.refunded',{refundedAmount:500});
 await order('order.refunded',{refundedAmount:500});
 expect((await ref().get()).data()!.aiPaidCents).toBe(475);
 await order('order.refunded',{refundedAmount:5000});
 expect((await ref().get()).data()!.aiPaidCents).toBe(0);
 expect((await ledger()).filter(e=>e.kind==='refund')).toHaveLength(2);
});

test('legacy subscription events, duplicated or out of order, never reset usage or add credit',async()=>{
 expect((await subscription('first','2026-11-01','2026-11-01')).status).toBe(200);
 await subscription('first','2026-11-01','2026-11-01');
 await subscription('old','2026-10-01','2026-10-01');
 await subscription('renewal','2026-12-01','2026-12-01');
 const org=(await ref().get()).data()!;
 expect(org).toMatchObject({aiUsageCurrent:12,aiUsageMonth:'2026-11',aiPaidCents:0});
 expect(org.aiBonusCents??0).toBe(0);
 expect(await ledger()).toEqual([]);
});
