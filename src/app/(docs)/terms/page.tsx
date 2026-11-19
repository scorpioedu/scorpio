import { Metadata } from "next";
import { DocHeader, DocSection, docLink } from "@/components/docs-prose";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms and conditions for using the Scorpio learning platform for schools, teachers, and students.",
};

export default function TermsPage() {
  return (
    <article className="w-full pb-20">
      <DocHeader
        title="Terms of Service"
        summary="The terms for responsible use of AI in physics education."
        meta="Effective February 16, 2026"
      />

      <DocSection number={1} title="Acceptance of terms">
        <p>By accessing and using Scorpio, you agree to be bound by these Terms of Service. If you are a minor, you represent that you have received parental or guardian consent to use the platform.</p>
      </DocSection>

      <DocSection number={2} title="Educational license">
        <p>Scorpio grants you a limited, non-exclusive, non-transferable license to use the platform for educational and research purposes. Commercial redistribution of our AI architecture or content is strictly prohibited.</p>
      </DocSection>

      <DocSection number={3} title="Prohibited conduct">
        <p>Users may not attempt to reverse-engineer the 4-layer constraint system, bypass pedagogical safeguards (DAR elimination), or use automated tools to harvest content from the platform.</p>
      </DocSection>

      <DocSection number={4} title="Academic integrity">
        <p>Scorpio is a tutoring aid, not a solution generator. Utilizing the platform to bypass institutional academic integrity policies is a violation of these terms and may result in account termination.</p>
      </DocSection>

      <DocSection number={5} title="Limitations and disclaimers">
        <p><strong className="font-medium text-foreground">AI accuracy.</strong> While Scorpio utilizes a sophisticated constraint architecture, Large Language Models may still produce errors. Users are encouraged to verify critical physics derivations with standard textbooks.</p>
        <p><strong className="font-medium text-foreground">Platform availability.</strong> We strive for 99.9% uptime, but Scorpio is provided &quot;as is&quot; without warranties of any kind regarding uninterrupted service during maintenance or third-party API outages.</p>
        <p><strong className="font-medium text-foreground">Termination.</strong> We reserve the right to suspend or terminate access to any user who violates these terms, specifically targeting those who attempt to disrupt the pedagogical integrity of the tutor.</p>
      </DocSection>

      <DocSection number={6} title="Limitation of liability">
        <p>In no event shall Scorpio or its suppliers be liable for any damages arising out of the use or inability to use the service.</p>
      </DocSection>

      <DocSection number={7} title="Governing law">
        <p>These terms shall be interpreted and governed by the laws of your jurisdiction, without regard to its conflict of law provisions.</p>
      </DocSection>

      <DocSection number={8} title="Changes to terms">
        <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days notice prior to any new terms taking effect.</p>
      </DocSection>

      <DocSection number={9} title="Contact">
        <p>If you have any questions about these Terms, please contact us at <a href="mailto:rushil@scorpioedu.org" className={docLink}>rushil@scorpioedu.org</a>.</p>
      </DocSection>
    </article>
  );
}
