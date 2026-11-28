import { Metadata } from "next";
import { DocHeader, DocSection, DocList, docLink } from "@/components/docs-prose";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the Scorpio team: questions from teachers and schools, account help, invoices and department demos.",
};

export default function ContactPage() {
  return (
    <article className="w-full pb-20">
      <DocHeader
        title="Contact"
        summary="Questions about using Scorpio in your classes, help with your account, invoices or a department demo: here is where to reach us."
      />

      <DocSection title="Ways to reach us">
        <DocList
          items={[
            {
              term: "Teachers, schools and support",
              description: (
                <>For questions about Scorpio, account help, invoices or a department demo: <a href="mailto:rushil@scorpioedu.org" className={docLink}>rushil@scorpioedu.org</a></>
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
            { term: "Can I use this in my school?", description: "Yes. Teachers request access, and we can set up a department pilot with you. Email us to talk it through." },
            { term: "Do students use AI in Scorpio?", description: "Not unless their teacher turns it on. Study, lessons, practice and marking use no AI. Teachers can choose to use AI for their own tools." },
          ]}
        />
      </DocSection>
    </article>
  );
}
