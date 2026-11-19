import { Metadata } from "next";
import { DocHeader, DocSection, docLink } from "@/components/docs-prose";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn what Scorpio collects, how AI providers process information, and how to request export or deletion.",
};

const sections = [
  {
    title: "Information collection",
    content: "We collect information you provide directly to us: account details (name, email), profile settings, and educational data generated during tutoring sessions (chat logs, mathematical inputs, and assignments).",
  },
  {
    title: "How we use data",
    content: "Account information and learning records are used to provide classroom, tutoring, and grading features. School records must not be used for unrelated research or model training without an appropriate separate agreement.",
  },
  {
    title: "Sharing and disclosure",
    content: "Scorpio does not sell student data. Firebase/Google Cloud hosts account and learning records. When an AI feature is used, its relevant text is processed by Google’s AI services. Polar processes billing events; email delivery providers process notification details. Authorized educators can access records within their permitted classroom or network scope. Text masking reduces some identifiers but does not guarantee anonymization.",
  },
  {
    title: "Technical security",
    content: "We implement industry-standard encryption for data at rest and in transit. All educational records are protected via Firebase Security Rules and granular role-based access control (RBAC).",
  },
  {
    title: "Compliance standards",
    content: "School deployment requires review of student ages, provider terms, school authorization, and applicable data-protection agreements. Scorpio does not claim a blanket FERPA or COPPA certification. Student AI use must not begin until the provider arrangement permits the intended age group.",
  },
];

export default function PrivacyPage() {
  return (
    <article className="w-full pb-20">
      <DocHeader
        title="Privacy Policy"
        summary="Education requires trust. This policy describes how Scorpio keeps student data secure while enabling AI-assisted learning."
        meta="Last updated November 7, 2026"
      />

      {sections.map((s, i) => (
        <DocSection key={s.title} number={i + 1} title={s.title}>
          <p>{s.content}</p>
        </DocSection>
      ))}

      <DocSection number={sections.length + 1} title="Your data rights">
        <p>
          Under various global regulations, you have the right to access, export, or request the deletion of your personal information. Signed-in users may request an export or delete their account in settings. Teacher accounts with active classes or network ownership require a supported handoff first. Deletion covers account profiles, submissions, uploaded work, notebooks, tutoring sessions, practice history, and portfolios. Billing/security records and provider backups may follow separate retention schedules; contact us to establish a school-specific retention and deletion agreement before onboarding.
        </p>
        <p>
          To request a data export or ask a privacy question, email{" "}
          <a href="mailto:rushil@scorpioedu.org" className={docLink}>rushil@scorpioedu.org</a>.
        </p>
      </DocSection>
    </article>
  );
}
