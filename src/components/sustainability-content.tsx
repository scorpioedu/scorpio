"use client";

import { useState, useMemo } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { DocHeader, DocSection, DocList } from "@/components/docs-prose";

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-6">
      <dt className="text-sm font-medium text-foreground">{label}</dt>
      <dd>
        <span className="font-mono text-sm text-foreground">{value}</span>
        <span className="ml-2 text-xs text-muted-foreground">{note}</span>
      </dd>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange }: { label: string; value: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[Number(value.split(" ")[0])]} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

export default function SustainabilityContent() {
  // Student Calculator State
  const [studentWeeklyHints, setStudentWeeklyHints] = useState<number>(15);
  // Teacher Calculator State
  const [teacherStudentCount, setTeacherStudentCount] = useState<number>(60);
  const [teacherAssignmentsPerSemester, setTeacherAssignmentsPerSemester] = useState<number>(16);

  const [copiedDisclosure, setCopiedDisclosure] = useState(false);

  // Student metrics calculations (Accurate empirical data based on Gemini 3.8 Flash on Google TPUs)
  // Avg Scorpio Socratic hint: ~0.20 Wh = 720 Joules of energy (approx 60-80 output tokens)
  // Traditional 1 sheet of 20lb paper: ~16 Wh of manufacturing energy, ~10 L of water (EPN data)
  // Equivalent 10W LED bulb: 10 Wh / hr = 0.166 Wh / min
  const studentMetrics = useMemo(() => {
    const weeklyEnergyWh = studentWeeklyHints * 0.20;
    const weeklyEnergyJoules = weeklyEnergyWh * 3600;
    const ledMinutes = (weeklyEnergyWh / 10) * 60;
    // An average student using digital assignments avoids ~3 printed worksheets per week
    const paperSheetsSaved = Math.round(studentWeeklyHints * 0.25);
    const waterSavedLiters = paperSheetsSaved * 10;
    const rawGridEmissionsGrams = weeklyEnergyWh * 0.38;

    return {
      weeklyEnergyWh: weeklyEnergyWh.toFixed(2),
      weeklyEnergyJoules: Math.round(weeklyEnergyJoules).toLocaleString(),
      ledMinutes: ledMinutes.toFixed(1),
      paperSheetsSaved,
      waterSavedLiters,
      rawGridEmissionsGrams: rawGridEmissionsGrams.toFixed(2),
    };
  }, [studentWeeklyHints]);

  // Teacher / Classroom metrics
  const teacherMetrics = useMemo(() => {
    const totalSubmissions = teacherStudentCount * teacherAssignmentsPerSemester;
    const sheetsSaved = totalSubmissions * 3;
    const treesSaved = (sheetsSaved / 8333).toFixed(2);
    const waterSavedGallons = Math.round((sheetsSaved * 10) / 3.785);
    const aiEnergyKWh = ((totalSubmissions * 0.4) / 1000).toFixed(2);
    const paperEnergySavedKWh = ((sheetsSaved * 16) / 1000).toFixed(1);

    return {
      totalSubmissions: totalSubmissions.toLocaleString(),
      sheetsSaved: sheetsSaved.toLocaleString(),
      treesSaved,
      waterSavedGallons: waterSavedGallons.toLocaleString(),
      aiEnergyKWh,
      paperEnergySavedKWh,
    };
  }, [teacherStudentCount, teacherAssignmentsPerSemester]);

  const districtDisclosureText = `Scorpio environmental summary

Scorpio runs its model on Google Cloud TPUs and keeps hints short to limit the amount of text the model generates. Google matches electricity use with renewable purchases over the year. The local grid mix varies by hour, and manufacturing the hardware produces emissions.

For a class of ${teacherStudentCount} students, moving ${teacherAssignmentsPerSemester} three-page assignments online could save ${teacherMetrics.sheetsSaved} sheets per semester. The calculator estimates that this could save about ${teacherMetrics.waterSavedGallons} gallons of water used in paper manufacturing.

Scorpio prioritizes reducing energy and paper use. We plan to support long-term carbon removal once we are consistently profitable.`;

  const copyDisclosure = () => {
    navigator.clipboard.writeText(districtDisclosureText);
    setCopiedDisclosure(true);
    toast.success("Environmental disclosure copied to clipboard!");
    setTimeout(() => setCopiedDisclosure(false), 2500);
  };

  return (
    <article className="w-full pb-20">
      <DocHeader
        title="Sustainability"
        summary="Each hint uses electricity, and cooling servers can use water. Digital assignments can also save paper. This page explains how we estimate those costs and what we do to keep them down."
        meta="Figures are estimates based on Gemini 3.8 Flash on Google Cloud TPUs"
      />

      <DocSection number={1} title="The physics behind a hint">
        <p>
          If you know a processor&apos;s power draw and how long it runs, you can estimate the energy it uses by multiplying the two. The data center also needs energy to carry away the heat. The calculator below uses estimates; try changing the number of hints you use or the number of assignments your class prints.
        </p>
      </DocSection>

      <DocSection number={2} title="What happens when you ask for a hint">
        <p>The request starts on your device. Most of the work happens at the data center, and the electricity and hardware both contribute to the footprint.</p>
        <DocList
          items={[
            { term: "Your device", description: "We estimate that sending a request over Wi-Fi or LTE uses about 0.005 Wh. Emissions depend on the electricity that charges your device." },
            { term: "Running the model", description: "Scorpio keeps hints short. The calculator uses 0.20 Wh (720 joules) per hint on Google TPU v5 hardware. Shorter replies give the model fewer tokens to generate." },
            { term: "Cooling the servers", description: "We estimate 0.2 to 0.5 mL of cooling water per hint. Actual use varies by data center and cooling system." },
            { term: "Powering the data center", description: "Google buys enough renewable energy to match its annual electricity use, but data centers still draw from their local grids throughout the day, and some of that electricity can come from fossil fuels." },
            { term: "Making the hardware", description: "Mining materials, manufacturing chips, and building data centers produce emissions before the servers run. These are separate from the electricity used to run a hint." },
          ]}
        />
      </DocSection>

      <DocSection number={3} title="Are we carbon neutral?">
        <p>
          Not yet. Scorpio still has emissions from cloud electricity and hardware. We plan to fund carbon removal once we are profitable.
        </p>
        <DocList
          items={[
            { term: "Scope 1: direct", description: "Scorpio operates no vehicle fleets, factories, or fossil-fuel boilers." },
            { term: "Scope 2: cloud electricity", description: "Renewable purchases match annual electricity use. The local grid mix changes by hour." },
            { term: "Scope 3: hardware", description: "Manufacturing the chips and other equipment produces emissions." },
          ]}
        />
        <h3 className="pt-2 text-base font-semibold text-foreground">Our plan to fund carbon removal</h3>
        <p>
          Once Scorpio is consistently profitable, we plan to put 1% to 2% of platform revenue toward long-term carbon removal through Stripe Climate and Frontier.
        </p>
        <h3 className="pt-2 text-base font-semibold text-foreground">An example of what the pledge could fund</h3>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>One year of hints: at 720 hints a year and 0.20 Wh per hint, a student would use about 144 Wh. This example assumes a footprint of 150 grams of CO₂e including hardware.</li>
          <li>Example removal cost: at an assumed price of $350 per metric ton, removing 0.15 kg would cost about 5 cents.</li>
          <li>Example contribution: at that same price, 50 cents to $1 per student could fund about 1.4 to 2.9 kg of removal.</li>
        </ol>
        <h3 className="pt-2 text-base font-semibold text-foreground">What we&apos;re working toward</h3>
        <DocList
          items={[
            { term: "Today (in use)", description: "Shorter hints. We limit how much text each hint generates and run the model on Google Cloud TPUs." },
            { term: "When profitable (planned)", description: "Fund carbon removal with a share of revenue." },
            { term: "Google's goal (2030 target)", description: "Clean power every hour: Google aims to match electricity use with carbon-free power around the clock." },
          ]}
        />
      </DocSection>

      <DocSection number={4} title="How hints compare with printed worksheets">
        <p>Making paper takes energy and water too. This is a rough comparison using the estimates in the calculator.</p>
        <DocList
          items={[
            { term: "One sheet of copy paper", description: "About 16 Wh and 10 L of water, including making and transporting the paper." },
            { term: "One Scorpio hint", description: "About 0.20 Wh and 0.3 mL of water. Making one sheet takes about 80 times the energy of generating one hint." },
            { term: "One class over a semester", description: "About 2,880 fewer sheets for a class of 60 students that moves 16 three-page assignments online." },
          ]}
        />
      </DocSection>

      <DocSection number={5} title="Estimate your impact">
        <p>Change the sliders to estimate the energy used by hints or the paper a class could save.</p>
        <Tabs defaultValue="student" className="pt-2">
          <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border/60 bg-transparent p-0">
            <TabsTrigger value="student" className="flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-2 pt-0 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">Student</TabsTrigger>
            <TabsTrigger value="teacher" className="flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-2 pt-0 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">Teacher</TabsTrigger>
          </TabsList>

          <TabsContent value="student" className="space-y-5 pt-4">
            <SliderRow label="Hints in a typical week" value={`${studentWeeklyHints} hints`} min={2} max={60} step={1} onChange={setStudentWeeklyHints} />
            <dl className="divide-y divide-border/40 border-y border-border/40">
              <Stat label="Energy used" value={`${studentMetrics.weeklyEnergyWh} Wh`} note={`${studentMetrics.weeklyEnergyJoules} joules`} />
              <Stat label="10 W light bulb" value={`${studentMetrics.ledMinutes} min`} note="time to power an LED desk bulb" />
              <Stat label="Paper saved" value={`~${studentMetrics.paperSheetsSaved} sheets`} note="by doing work digitally" />
              <Stat label="Water saved" value={`${studentMetrics.waterSavedLiters} L`} note="from avoided paper mill bleaching" />
            </dl>
          </TabsContent>

          <TabsContent value="teacher" className="space-y-5 pt-4">
            <SliderRow label="Enrolled students" value={`${teacherStudentCount} students`} min={10} max={200} step={5} onChange={setTeacherStudentCount} />
            <SliderRow label="Assignments per semester" value={`${teacherAssignmentsPerSemester} assignments`} min={4} max={32} step={2} onChange={setTeacherAssignmentsPerSemester} />
            <dl className="divide-y divide-border/40 border-y border-border/40">
              <Stat label="Fewer printed pages" value={`${teacherMetrics.sheetsSaved} pages`} note={`across ${teacherMetrics.totalSubmissions} submissions`} />
              <Stat label="Trees preserved" value={`~${teacherMetrics.treesSaved} trees`} note="standard wood pulp ratio" />
              <Stat label="Water saved" value={`${teacherMetrics.waterSavedGallons} gal`} note="avoided paper mill processing" />
              <Stat label="Paper manufacturing energy" value={`+${teacherMetrics.paperEnergySavedKWh} kWh`} note={`saved vs ${teacherMetrics.aiEnergyKWh} kWh of AI used`} />
            </dl>

            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Environmental summary for schools</h3>
                  <p className="text-xs text-muted-foreground">Copy a summary of the estimates for your syllabus or district review.</p>
                </div>
                <Button variant="outline" size="sm" onClick={copyDisclosure} className="shrink-0 gap-2">
                  {copiedDisclosure ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
                </Button>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                {districtDisclosureText}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </DocSection>

      <DocSection number={6} title="What we do to use less">
        <p>We keep hints short, make common formulas easy to look up, and give classes a way to use less paper.</p>
        <DocList
          items={[
            { term: "Short hints", description: "We keep hints short so the model generates fewer tokens and students can get back to the problem." },
            { term: "Cutting emissions first", description: "We focus on reducing the energy and materials Scorpio uses. Our plan is to support carbon removal that can be measured and verified." },
            { term: "Google Cloud TPUs", description: "The model runs on processors designed for the kinds of calculations it performs." },
            { term: "Equation Vault", description: "Formulas are stored on your device, so you can look up a constant or an equation without running the model." },
            { term: "Long-term carbon removal", description: "Planned once profitable: projects that can verify how much carbon they remove and how long it stays stored." },
            { term: "Digital assignments", description: "Teachers can post and grade assignments online, and students can turn them in without printing a copy." },
          ]}
        />
      </DocSection>

      <DocSection number={7} title="Playbooks">
        <h3 className="text-base font-semibold text-foreground">For students: get help with fewer prompts</h3>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><span className="font-medium text-foreground">Ask about the step you&apos;re stuck on.</span> Point to the equation or step that&apos;s giving you trouble, for example how to split a force into horizontal and vertical components.</li>
          <li><span className="font-medium text-foreground">Try the hint before asking again.</span> Spend a minute working through the hint on scratch paper. If you&apos;re still stuck, say what you tried.</li>
          <li><span className="font-medium text-foreground">Look up formulas in the Equation Vault.</span> Constants, formulas, and units are there without sending an AI request.</li>
        </ol>
        <h3 className="pt-3 text-base font-semibold text-foreground">For teachers: use less paper and help students get unstuck</h3>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><span className="font-medium text-foreground">Post problem sets online.</span> Post and collect problem sets in Scorpio to cut down on printing.</li>
          <li><span className="font-medium text-foreground">Add hints with Waypoints.</span> Add a hint at a step where students often get stuck, such as setting up a free-body diagram.</li>
          <li><span className="font-medium text-foreground">Use the calculator in class.</span> Ask students to estimate how much energy their study tools use by multiplying power by time.</li>
        </ol>
      </DocSection>

      <DocSection number={8} title="Questions about energy and emissions">
        <Accordion type="single" collapsible>
          <AccordionItem value="faq-1">
            <AccordionTrigger className="text-sm font-medium text-foreground">How much water does a hint use?</AccordionTrigger>
            <AccordionContent>
              <p>We use 0.2 to 0.5 mL of cooling water per hint as an estimate. The amount varies with the data center, its cooling system, and the work each request takes.</p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-2">
            <AccordionTrigger className="text-sm font-medium text-foreground">How do you approach carbon offsets?</AccordionTrigger>
            <AccordionContent>
              <p>We focus first on the energy and materials we can save. For future purchases, we plan to fund projects that can measure how much carbon they remove and verify how long it stays stored.</p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-3">
            <AccordionTrigger className="text-sm font-medium text-foreground">Does the data center run on clean energy around the clock?</AccordionTrigger>
            <AccordionContent>
              <p>Google matches its electricity use with renewable purchases over the year. At any given hour, a data center draws power from its local grid, which can include natural gas or coal.</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DocSection>
    </article>
  );
}
