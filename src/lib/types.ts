import { Timestamp } from "firebase/firestore";

export type UserRole = "teacher" | "student" | "school_admin" | "super_admin";

export interface UserPreferences {
  autoRedirectPortal?: boolean;
  disableAssignmentEmails?: boolean;
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

  // AI Budgeting & Usage
  aiBudgetLimit: number; // Monthly budget in cents or "token units" (e.g. 500 = $5.00)
  aiUsageCurrent: number; // Current month's usage in same units
  practiceLimitPerStudent?: number; // Allowance assigned per member (legacy)
  practiceLimit?: number; // Calculated: practiceLimitPerStudent * memberCount (legacy)
  practiceUsageCurrent?: number; // Current month's practice usage count (legacy)
  notebookLimitPerStudent?: number; // Max notebooks a student can create
  aiNotebookLimitPerStudent?: number; // Max AI interactions per student per month
  notebookLimit?: number; // Total network usage limit for interactions
  aiTutorLimitPerStudent?: number; // Max AI tutor messages per student per month
  baseMonthlyFee: number; // Flat fee for storage/base features
  /** Set when a Scorpio admin made this network a pilot. Kept after the pilot ends or converts to paid. */
  pilot?: OrganizationPilot;
  lastAiUsageAt?: Timestamp | Date;
}

export type PilotStatus = "active" | "ended" | "converted";

export interface OrganizationPilot {
  cohort: string;
  status: PilotStatus;
  startedAt: string; // ISO
  endsAt?: string | null; // ISO; AI is refused after this
  budgetCents: number; // what was granted at start (top-ups raise aiBudgetLimit)
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
