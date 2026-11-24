import { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import CostComparisonChart from "@/components/admin/cost-comparison-chart";
import { DocHeader, DocSection, DocList, docLink } from "@/components/docs-prose";

export const metadata: Metadata = {
  title: "Research & Methodology",
  description:
    "Explore Scorpio: A verifiable framework for enforcing Socratic scaffolding in physics LLMs beyond fine-tuning. Results from our 125-response expert-validated ablation study.",
  keywords: [
    "AI Research",
    "STEM Education",
    "Constraint Engineering",
    "Socratic Scaffolding",
    "Physics LLM",
    "Expert Validation",
  ],
};

export default function ResearchPage() {
  const researchHighlights = [
    {
      metric: "Direct Answer Rate (DAR)",
      finding: "Reduced from 100% (NONE) to 0% (FULL) in all procedural physics problems",
      impact: "Eliminates answer-harvesting and forces productive struggle",
      significance: "Critical",
    },
    {
      metric: "Expert Validation",
      finding:
        "Independent Ph.D. audit confirmed a +0.67 point gain in pedagogical quality for the FULL stack",
      impact: "Statistically validates framework efficacy beyond self-assessment",
      significance: "High",
    },
    {
      metric: "Notation Accuracy",
      finding:
        "LaTeX mathematical density peaked at 0.92 per 100 words with explicit notation constraints",
      impact: "Ensures professional academic standards and symbolic clarity",
      significance: "High",
    },
    {
      metric: "Socratic Engagement",
      finding: "FULL stack achieved 1.25 questions per response (vs. 0.50 for DOMAIN ONLY)",
      impact: "Significant increase in inquiry-based student interaction",
      significance: "Medium",
    },
  ];

  /* ... rest of existing research logic ... */

  const constraintLevels = [
    {
      level: "NONE",
      description: "Baseline Gemini 3.8 Flash, no constraints",
      domainAdherence: "100.0%",
      directAnswerRate: "100.0%",
      pedagogicalQuality: "4.38",
      latexUsage: "0.22",
      avgQuestions: "1.00",
    },
    {
      level: "DOMAIN",
      description: "Physics domain restriction only",
      domainAdherence: "100.0%",
      directAnswerRate: "100.0%",
      pedagogicalQuality: "4.50",
      latexUsage: "0.35",
      avgQuestions: "0.50",
    },
    {
      level: "PEDAGOGY",
      description: "Domain + response classification",
      domainAdherence: "100.0%",
      directAnswerRate: "0.0%",
      pedagogicalQuality: "3.88",
      latexUsage: "0.28",
      avgQuestions: "1.12",
    },
    {
      level: "NOTATION",
      description: "Domain + pedagogy + LaTeX/unit enforcement",
      domainAdherence: "100.0%",
      directAnswerRate: "0.0%",
      pedagogicalQuality: "4.12",
      latexUsage: "0.88",
      avgQuestions: "1.00",
    },
    {
      level: "FULL",
      description: "Complete Socratic tutoring stack",
      domainAdherence: "100.0%",
      directAnswerRate: "0.0%",
      pedagogicalQuality: "4.62",
      latexUsage: "0.92",
      avgQuestions: "1.25",
    },
  ];

  const methodologyData = [
    {
      category: "Test Battery",
      count: "25 questions",
      breakdown: "Conceptual (8), Procedural (12), Adversarial (5)",
    },
    {
      category: "Sample Size",
      count: "125 responses",
      breakdown: "25 questions × 5 constraint levels",
    },
    {
      category: "Difficulty Levels",
      count: "4 tiers",
      breakdown: "Basic, Intermediate, Advanced, College",
    },
    {
      category: "Evaluator Stats",
      count: "625 assessments",
      breakdown: "125 responses × 5 blinded criteria passes",
    },
    {
      category: "Expert Validation",
      count: "Ph.D. Audit",
      breakdown: "Blinded holistic scoring on stratified 30-item subset",
    },
    {
      category: "AI Model",
      count: "Gemini 3.8 Flash",
      breakdown: "Inference-time constraint layering (no fine-tuning)",
    },
  ];

  const layers = [
    { term: "1. Domain", description: "Enforces physics context and refuses off-topic requests." },
    { term: "2. Pedagogical", description: "Classifies student intent and selects a scaffolding mode." },
    { term: "3. Notation", description: "Enforces LaTeX and unit syntax for scientific notation." },
    { term: "4. Socratic", description: "Elicits student reasoning and validates responses against Socratic rules." },
  ];
  const pdf = "/Scorpio_Verifiable_Physics_Tutoring_LLM.pdf";

  return (
    <article className="w-full pb-20">
      <DocHeader
        title="Research & Methodology"
        summary="Scorpio: A Verifiable Framework for Enforcing Socratic Scaffolding in Physics LLMs Beyond Fine-Tuning. Our research formalizes a four-layer architecture that structures verifiable AI behavior at inference time, achieving a 0% Direct Answer Rate and significant pedagogical gains."
        meta="Paper updated February 16, 2026"
      />

      <p className="mb-8 border-l-2 border-border pl-4 text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Terminology.</span> Scorpio is the name of the physics platform.
        The AI learning assistant, previously called Tutor, is now called Raise throughout the product.
      </p>

      <DocSection id="architecture" number={1} title="The 4-layer architecture">
        <DocList items={layers} />
      </DocSection>

      <DocSection number={2} title="Key findings">
        <DocList
          items={researchHighlights.map((h) => ({
            term: h.metric,
            description: (
              <>
                {h.finding}. <span className="text-foreground/80">{h.impact}.</span>
              </>
            ),
          }))}
        />
      </DocSection>

      <DocSection number={3} title="System performance by constraint level">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Level</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Domain adh.</TableHead>
                <TableHead className="text-right">DAR</TableHead>
                <TableHead className="text-right">LaTeX</TableHead>
                <TableHead className="text-right">Avg Qs</TableHead>
                <TableHead className="text-right">Quality</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {constraintLevels.map((level) => (
                <TableRow key={level.level}>
                  <TableCell className="font-medium text-foreground">{level.level}</TableCell>
                  <TableCell>{level.description}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{level.domainAdherence}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{level.directAnswerRate}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{level.latexUsage}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{level.avgQuestions}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{level.pedagogicalQuality}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <h3 className="pt-4 text-base font-semibold text-foreground">Performance by academic tier (FULL stack)</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Difficulty tier</TableHead>
              <TableHead className="text-right">Pedagogical quality</TableHead>
              <TableHead className="text-right">On-topic adherence</TableHead>
              <TableHead className="text-right">Avg response (chars)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["Basic", "3.88", "80.0%", "477"],
              ["Intermediate", "4.20", "100.0%", "689"],
              ["Advanced", "4.17", "100.0%", "2323"],
              ["College", "3.75", "100.0%", "3316"],
            ].map(([tier, q, adh, len]) => (
              <TableRow key={tier}>
                <TableCell className="font-medium text-foreground">{tier}</TableCell>
                <TableCell className="text-right font-mono text-xs">{q}</TableCell>
                <TableCell className="text-right font-mono text-xs">{adh}</TableCell>
                <TableCell className="text-right font-mono text-xs">{len}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DocSection>

      <DocSection number={4} title="Independent expert validation">
        <p>
          Inter-rater reliability on a stratified 30-item subset gave a Cohen&apos;s kappa of 0.51 (moderate agreement),
          indicating pedagogical alignment between the framework developers and Ph.D. physics educators.
        </p>
        <DocList
          items={[
            { term: "Expert baseline score", description: "3.16" },
            { term: "Expert FULL score", description: "3.83" },
            { term: "Gain over baseline", description: "+0.67 points (FULL vs NONE), validated by a Ph.D. physics expert" },
          ]}
        />
      </DocSection>

      <DocSection number={5} title="Methodology: ablation study design">
        <p>
          The design isolates each layer of the constraint architecture to measure its contribution to pedagogical effectiveness.
          We tested a battery of 25 physics questions across 4 difficulty tiers (Basic, Intermediate, Advanced, College) and 3 question
          types (Conceptual, Procedural, Adversarial). Each question was generated 5 times per constraint level for statistical reliability.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Measurement</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {methodologyData.map((item) => (
              <TableRow key={item.category}>
                <TableCell className="font-medium text-foreground">{item.category}</TableCell>
                <TableCell className="font-mono text-xs">{item.count}</TableCell>
                <TableCell>{item.breakdown}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DocSection>

      <DocSection number={6} title="Mathematical fidelity and notation">
        <p>
          Scorpio uses a custom-built LaTeX engine designed for physics pedagogy. From complex integrals to 4-vector notation,
          symbols are rendered with publication-grade precision.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Intuitive math builder UI</li>
          <li>Real-time KaTeX syntax validation</li>
          <li>Waypoints reference system</li>
          <li>Dynamic preview and correction</li>
        </ul>
      </DocSection>

      <DocSection number={7} title="Cost transparency and scaling">
        <p>
          We charge zero markup on AI costs. Most EdTech companies mark up API costs 300–500%; we charge exactly what Google charges us.
        </p>
        <DocList
          items={[
            { term: "Infrastructure", description: "Scorpio is free for every teacher, including department sharing, auto-grading and the class misconception report. AI runs on a prepaid balance: every network gets $1 of AI free each month, and teachers can top up from $5." },
            { term: "Zero markup", description: "$0.75 per 1M input tokens and $3.75 per 1M output tokens, Google Gemini 3.8 Flash rates through 31 December 2026, then $1.50 and $7.50 from 1 January 2027." },
            { term: "Enterprise scale", description: "Schools and districts can pay by invoice. Custom SSO and dedicated infrastructure are not built." },
          ]}
        />
        <div className="pt-4">
          <CostComparisonChart />
        </div>
      </DocSection>

      <DocSection id="paper" number={8} title="Full paper">
        <p>
          <a href={pdf} download className={docLink}>Download the PDF</a>
        </p>
        <h3 className="pt-2 text-base font-semibold text-foreground">Abstract</h3>
        <div className="max-w-2xl text-foreground/90">
          <MarkdownRenderer>
            {`While Large Language Models (LLMs) have demonstrated significant potential in STEM education, their tendency to provide direct solutions often undermines the learning process. This paper presents **Scorpio**, a framework that utilizes "Constraint Engineering" to transform a general-purpose LLM into a specialized, **verifiable physics tutor**. By implementing a layered architecture of inference-time rules, we enforce **Socratic scaffolding** without the need for expensive fine-tuning. Our results from a 125-response ablation study demonstrate that Scorpio successfully eliminates direct answer delivery (0% DAR), achieving a peak pedagogical quality score of **4.62**. Independent expert validation (Ph.D. physics educator) confirmed this success, with the expert independently ranking the FULL constraint system as the highest performing (Expert: 3.83 vs 3.16 baseline) and confirming a significant +0.67 point improvement in pedagogical quality. This work demonstrates that inference-time constraint layering can meaningfully shift LLM tutoring behavior toward Socratic scaffolding, proving that modular constraints can effectively manage complex STEM pedagogy at scale.`}
          </MarkdownRenderer>
        </div>
        <iframe
          src={`${pdf}#toolbar=0`}
          className="mt-4 h-[800px] w-full rounded-md border border-border/60 bg-muted"
          title="Scorpio Research Paper"
        />
      </DocSection>
    </article>
  );
}
