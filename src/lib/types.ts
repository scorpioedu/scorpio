import { Timestamp } from "firebase/firestore";

export type UserRole = "teacher" | "student" | "school_admin" | "super_admin";

export interface UserPreferences {
  autoRedirectPortal?: boolean;
  /** Teachers: stop all student emails (new work, due reminders, results). On unless set to true. */
  disableAssignmentEmails?: boolean;
  /** Students: stop every Scorpio email to themselves. */
  disableStudentEmails?: boolean;
  /** Teachers: turn off the Monday summary email (sendTeacherDigests). On unless set. */
  disableWeeklyDigest?: boolean;
  /** Teacher Home setup card: "started" once it has been shown unfinished, "done" once hidden. */
  setupChecklist?: "started" | "done";
  /** The teacher chose "Skip for now" on the first-run page; kept here so it holds on every device. */
  welcomeSkipped?: boolean;
  /** Teachers: id of the newest "What's new" entry they dismissed (src/lib/whats-new.ts). */
  whatsNewSeen?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;

  // Multi-tenancy & Network
  organizationId?: string; // Root organization/department ID

  // Primary Relationships
  teacherId?: string; // For students: direct link to primary teacher
  courseId?: string; // For students: direct link to primary class/course
  schoolId?: string; // For students: linked school
  classIds: string[]; // List of /classes/{id} the user belongs to

  // Preferences
  preferences?: UserPreferences;

  // Onboarding
  onboarding?: Record<string, boolean>;

  // Metadata
  createdAt: Timestamp | Date;
  lastLoginAt: Timestamp | Date;
  /** When this teacher dismissed the pilot welcome popup (server-written). */
  pilotWelcomedAt?: Timestamp | Date;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string; // The primary teacher who manages the subscription
  ownerEmail?: string;
  polarCustomerId?: string; // Replaced Stripe with Polar
  subscriptionStatus: "active" | "past_due" | "canceled" | "none";
  planId: "free" | "standard_monthly" | "standard_yearly" | "pro_monthly" | "pro_yearly" | string;
  createdAt: Timestamp | Date;

  // AI balance (credit model, functions/src/budget-policy.ts). All amounts in cents.
  aiBudgetLimit: number; // Owner's optional monthly spend cap; 0 = no cap
  aiUsageCurrent: number; // Spend in the month named by aiUsageMonth
  aiUsageMonth?: string; // YYYY-MM
  aiUsageReserved?: number; // Held for AI calls in flight
  aiUsageTotalCents?: number; // All-time spend
  aiFreeMonth?: string; // YYYY-MM the free allowance counter belongs to
  aiFreeUsedCents?: number; // Spend against this month's free $1
  aiBonusCents?: number; // Referral, welcome, pilot and admin credit
  aiBonusExpiresAt?: string; // ISO; bonus counts as zero after it
  aiPaidCents?: number; // Deposits and invoices; may be negative after a refund
  practiceLimitPerStudent?: number; // Allowance assigned per member (legacy)
  practiceLimit?: number; // Calculated: practiceLimitPerStudent * memberCount (legacy)
  practiceUsageCurrent?: number; // Current month's practice usage count (legacy)
  notebookLimitPerStudent?: number; // Max notebooks a student can create
  aiNotebookLimitPerStudent?: number; // Max AI interactions per student per month
  notebookLimit?: number; // Total network usage limit for interactions
  aiTutorLimitPerStudent?: number; // Max AI tutor messages per student per month
  baseMonthlyFee?: number; // Legacy flat fee, unused since the credit model
  /** Set when a Scorpio admin made this network a pilot. Kept after the pilot ends or converts to paid. */
  pilot?: OrganizationPilot;
  lastAiUsageAt?: Timestamp | Date;
}

export type PilotStatus = "active" | "ended" | "converted";

export interface OrganizationPilot {
  cohort: string;
  status: PilotStatus;
  startedAt: string; // ISO
  endsAt?: string | null; // ISO
  budgetCents: number; // what was granted at start, as bonus credit
  grantedCents?: number; // start + top-ups
  note?: string | null;
  source?: "admin" | "invite";
}

/**
 * Loose shape of a question as produced by the AI parser / manual parser and stored on assignments.
 * Unknown extra fields are preserved (index signature) because teachers' stored data varies.
 */
export interface AssignmentQuestion {
  id?: string;
  text: string;
  type: "text" | "multiple-choice" | "true-false" | "short-answer";
  options?: string[];
  correctAnswer?: string;
  points?: number;
  [key: string]: unknown;
}

export interface PhysicsAssignment {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  organizationId?: string;
  courseId: string;
  visibility: "private" | "network" | "global";
  questions: AssignmentQuestion[];
  createdAt: Timestamp | Date;
}

export interface StudentPortfolio {
  studentId: string;
  organizationId: string;
  teacherId: string;
  lastUpdated: Timestamp | Date;
  strengths: string[];
  weaknesses: string[];
  masteryLevel: "Beginner" | "Intermediate" | "Advanced" | "Expert";
  aiSummary: string;
}
