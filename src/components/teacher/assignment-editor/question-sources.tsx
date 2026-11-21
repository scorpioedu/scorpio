"use client";

// Add questions by generating them with the AI or importing pasted text.
import { useState } from "react";
import { FileDown, Loader2, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { parseQuestionsManually } from "@/lib/assignment-parser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AI_COUNT, clampAiCount, fromGenerated, type Question, type RawQuestion } from "./types";
import { flagAnswerChecks } from "./answer-checks";

export function QuestionSources({
  isFreePlan,
  userId,
  onAdd,
}: {
  isFreePlan: boolean;
  userId?: string;
  onAdd: (questions: Question[]) => void;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiContext, setAiContext] = useState("");
  // Text, so the box can be empty while typing; clampAiCount reads it when generating.
  const [aiCount, setAiCount] = useState(String(AI_COUNT.fallback));
  const [aiDifficulty, setAiDifficulty] = useState("Medium");
  const [aiQuestionType, setAiQuestionType] = useState("mixed");
  const [aiLoading, setAiLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  const handleImportQuestions = async () => {
    if (!importText.trim()) {
      toast.error("Please paste some text to import questions.");
      return;
    }
    setImportLoading(true);
    try {
      let parsedQuestions: RawQuestion[] = [];
      // Try manual parser first
      try {
        parsedQuestions = parseQuestionsManually(importText);
        if (parsedQuestions.length > 0) {
          console.log("Successfully parsed with manual parser");
        } else {
          throw new Error("Manual parser found no questions");
        }
      } catch (manualError) {
        console.log("Manual parsing failed, trying AI parser...", manualError);
        // Fall back to AI parsing
        const res = await authenticatedFetch("/api/ai/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: importText, userId }),
        });

        if (!res.ok) {
          let errMsg = "AI Parsing failed";
          try {
            const err = await res.json();
            errMsg = err.error || errMsg;
          } catch {
            errMsg = `Parsing error (${res.status})`;
          }
          throw new Error(errMsg);
        }

        const result = await res.json();
        parsedQuestions = result.questions;
      }
      const newQuestions: Question[] = parsedQuestions.map(fromGenerated);
      onAdd(newQuestions);
      setImportOpen(false);
      setImportText("");
      toast.success(`Successfully imported ${newQuestions.length} questions!`);
    } catch (error: unknown) {
      console.error("Failed to import questions", error);
      const msg =
        error instanceof Error ? error.message : "Failed to import questions. Please try again.";
      toast.error(msg);
    } finally {
      setImportLoading(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiTopic) return;
    const count = clampAiCount(aiCount);
    setAiCount(String(count));
    setAiLoading(true);
    try {
      const res = await authenticatedFetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: aiTopic,
          count,
          difficulty: aiDifficulty,
          questionType: aiQuestionType,
          userId,
          context: aiContext,
        }),
      });

      if (!res.ok) {
        let errMsg = "Failed to generate questions.";
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = `AI Generation API error (${res.status})`;
        }
        throw new Error(errMsg);
      }

      const result = await res.json();
      const generatedQuestions: RawQuestion[] = result.questions;
      const newQuestions: Question[] = generatedQuestions.map(fromGenerated);
      onAdd(newQuestions);
      const flagged = flagAnswerChecks(generatedQuestions, newQuestions);
      setAiOpen(false);
      setAiTopic("");
      const check = flagged
        ? ` ${flagged === 1 ? "1 answer needs" : `${flagged} answers need`} a second look.`
        : "";
      // Fewer than asked for: say how many, not "success".
      if (typeof result.message === "string" && result.message)
        toast.warning(`${result.message}${check}`);
      else toast.success(`Successfully generated ${newQuestions.length} questions!${check}`);
    } catch (error: unknown) {
      console.error("Failed to generate questions", error);
      const msg =
        error instanceof Error ? error.message : "Failed to generate questions. Please try again.";
      toast.error(msg);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isFreePlan}
            title={isFreePlan ? "Requires AI access" : undefined}
          >
            <Sparkles />
            Generate with AI
            {isFreePlan && <Lock className="size-3" />}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">Generate questions</DialogTitle>
            <DialogDescription>
              Choose a topic, then review the generated questions before assigning them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ai-topic">Focus Topic</Label>
                <Input
                  id="ai-topic"
                  placeholder="e.g. Kinematics"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-count">Number of Questions</Label>
                <Input
                  id="ai-count"
                  type="number"
                  min={AI_COUNT.min}
                  max={AI_COUNT.max}
                  step={1}
                  inputMode="numeric"
                  value={aiCount}
                  onChange={(e) => setAiCount(e.target.value)}
                  onBlur={() => setAiCount(String(clampAiCount(aiCount)))}
                  aria-describedby="ai-count-hint"
                />
                <p id="ai-count-hint" className="text-xs text-muted-foreground">
                  {AI_COUNT.min} to {AI_COUNT.max}. Larger sets take longer.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-context">Instructions or Learning Objectives (Optional)</Label>
              <Textarea
                id="ai-context"
                placeholder="e.g. Focus on Newton's Second Law, include technical friction analysis..."
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Difficulty Level</Label>
                <RadioGroup
                  value={aiDifficulty}
                  onValueChange={setAiDifficulty}
                  className="flex gap-4"
                >
                  {["Easy", "Medium", "Hard"].map((diff) => (
                    <div key={diff} className="flex items-center space-x-2">
                      <RadioGroupItem value={diff} id={`diff-${diff}`} />
                      <Label htmlFor={`diff-${diff}`} className="text-sm font-normal">
                        {diff}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Question Type</Label>
                <RadioGroup
                  value={aiQuestionType}
                  onValueChange={setAiQuestionType}
                  className="grid grid-cols-2 gap-2"
                >
                  {[
                    { value: "mixed", label: "Mixed" },
                    { value: "multiple-choice", label: "Multiple Choice" },
                    { value: "true-false", label: "True/False" },
                    { value: "short-answer", label: "Short Answer" },
                    { value: "text", label: "Free Response" },
                  ].map((type) => (
                    <div key={type.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={type.value} id={`type-${type.value}`} />
                      <Label htmlFor={`type-${type.value}`} className="text-xs font-normal">
                        {type.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAiGenerate}
              disabled={aiLoading || !aiTopic}
              className="w-full sm:w-auto"
            >
              {aiLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Questions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isFreePlan}
            title={isFreePlan ? "Requires AI access" : undefined}
          >
            <FileDown />
            Import text
            {isFreePlan && <Lock className="size-3" />}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import questions</DialogTitle>
            <DialogDescription>
              Paste questions from a document or form. Include answer choices and answer keys if you
              have them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="question-import-text">Questions to import</Label>
            <Textarea
              id="question-import-text"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste your questions here..."
              rows={8}
              className="max-h-[45dvh] resize-y"
            />
          </div>
          <DialogFooter>
            <Button onClick={handleImportQuestions} disabled={importLoading || !importText}>
              {importLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
