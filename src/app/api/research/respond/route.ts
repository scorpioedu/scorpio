import { NextRequest, NextResponse } from 'next/server';
import { billingContext } from '@/lib/billing-context';
import { explainPhysicsConcept, helpSolveProblem } from '@/lib/ai/tutor';
import { CONSTRAINT_LEVELS, ConstraintLevel } from '@/lib/ai/constants';
import { withAuthorizedRequest } from '@/lib/auth-verify';
import { parseJsonBody } from '@/lib/api-schema';
import { researchRespondBody } from '@/lib/schemas/api-bodies';
async function handleResearch(req: NextRequest) {
  const parsed=await parseJsonBody(req,researchRespondBody,{message:'Invalid research request'});
  if(!parsed.ok)return parsed.response;
  const {message,mode,level}=parsed.data;
  if(!(level in CONSTRAINT_LEVELS))return NextResponse.json({error:'Invalid research request'},{status:400});
  try {
    const response=await billingContext.run({organizationId:process.env.LANDING_ORG_ID||'',type:'research'},()=>mode==='concept'?explainPhysicsConcept(message,[],level as ConstraintLevel):helpSolveProblem(message,[],level as ConstraintLevel));
    return NextResponse.json(response);
  } catch {return NextResponse.json({error:'Research request failed; check budget and provider configuration'},{status:503});}
}

// Requires the admin claim; every call is written to admin_audit.
export const POST = withAuthorizedRequest(handleResearch, { admin: true, rateLimit: "research" });
