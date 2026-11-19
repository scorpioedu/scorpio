import { Metadata } from "next";
import { DocHeader, DocSection, DocList, docLink } from "@/components/docs-prose";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the Scorpio team. We're here to help schools and educators transform physics education with AI.",
};

export default function ContactPage() {
  return (
    <article className="w-full pb-20">
      <DocHeader
        title="Contact support"
        summary="Whether you're an educator deploying Scorpio in your classroom or a developer exploring the architecture, here is where to reach us."
      />

      <DocSection title="Ways to reach us">
        <DocList
          items={[
            {
              term: "Technical support",
              description: (
                <>For platform bugs, account issues, or deployment questions: <a href="mailto:rushil@scorpioedu.org" className={docLink}>rushil@scorpioedu.org</a></>
              ),
            },
            {
              term: "Open source",
              description: (
                <>Submit issues, feature requests, or contributions on{" "}
                  <a href="https://github.com/RushilMahadevu/scorpio/issues" target="_blank" rel="noopener noreferrer" className={docLink}>GitHub</a>.</>
              ),
            },
            {
              term: "Research inquiries",
              description: (
                <>Questions about the 4-layer constraint architecture or data: see <a href="/research" className={docLink}>Research &amp; Methodology</a>.</>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection title="Frequently asked questions">
        <DocList
          items={[
            { term: "Is Scorpio open source?", description: "Yes. Scorpio is licensed under the MIT license and is available for community contributions on GitHub." },
            { term: "How do I reset my password?", description: "Password resets are handled securely through Firebase Auth. Click “Forgot Password” on the login screen." },
            { term: "Can I use this in my school?", description: "Scorpio is built for scale. Contact us for priority setup or documentation on self-hosting your own instance." },
            { term: "What AI models are supported?", description: "We currently optimize for Gemini 3.8 Flash, but our constraint architecture is model-agnostic." },
          ]}
        />
      </DocSection>
    </article>
  );
}
