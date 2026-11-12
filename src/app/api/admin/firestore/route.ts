import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { withAuthorizedRequest, type AuthorizedContext } from '@/lib/auth-verify';
import { errorResponse } from '@/lib/api-errors';

// List of allowed collections we expose in the Explorer.
const ALLOWED_COLLECTIONS = [
  'users',
  'organizations',
  'courses',
  'assignments',
  'submissions',
  'practice_history',
  'tutor_sessions',
  'portfolios',
  'teacherInviteCodes',
  'accessRequests',
  'usage',
  'usage_analytics',
  'landing_visitors',
];

async function handleAdminFirestore(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Service unavailable: Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { action, collectionName, limit = 50, lastDocId, filterField, filterValue } = body;

    // ─── LIST COLLECTIONS ────────────────────────────────────────────────────
    if (action === 'listCollections') {
      return NextResponse.json({ collections: ALLOWED_COLLECTIONS });
    }

    // ─── QUERY COLLECTION (READ ONLY) ─────────────────────────────────────────
    if (action === 'queryCollection') {
      if (!collectionName || !ALLOWED_COLLECTIONS.includes(collectionName)) {
        return NextResponse.json({ error: 'Invalid or missing collection name' }, { status: 400 });
      }

      let query: FirebaseFirestore.Query = adminDb.collection(collectionName);

      if (filterField && filterValue !== undefined && filterValue !== "") {
        // Simple equality filter
        // Note: Equality filters paired with orderBy('__name__', 'asc') do not require a built index.
        query = query.where(filterField, '==', filterValue);
      }

      // We default to sorting by a field to ensure stable pagination.
      // Many collections use 'createdAt' but some do not. We can just list by document ID
      // To paginate efficiently by Document ID:
      query = query.orderBy('__name__', 'asc');

      if (lastDocId) {
        // Fetch the cursor doc to start after
        const cursorDoc = await adminDb.collection(collectionName).doc(lastDocId).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const snapshot = await query.limit(Math.min(limit, 100)).get();

      const docs = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
        // We ensure any Firestore Timestamps are serialized safely
      }));

      // Safely stringify nested objects/timestamps to handle Next.js JSON serialization
      const safeDocs = JSON.parse(
        JSON.stringify(docs, (key, value) => {
          if (value && typeof value === 'object') {
            if (value._seconds !== undefined && value._nanoseconds !== undefined) {
              return new Date(value._seconds * 1000).toISOString();
            }
          }
          return value;
        })
      );

      return NextResponse.json({
        docs: safeDocs,
        lastDocId: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null,
        hasMore: snapshot.docs.length === limit,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    return errorResponse(err, 'admin-firestore', requestId);
  }
}

// Requires a verified ID token carrying the `admin: true` claim; every call is written to admin_audit.
export const POST = withAuthorizedRequest(handleAdminFirestore, { admin: true, rateLimit: "write" });
