"use client";

// The questions of an assignment: type, prompt, answer key, choices, points, order.
// Used by the create page and by the assignment's Problems tab.
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MathInputField } from "@/components/math-input";
import { NumericAnswerEditor } from "./numeric-answer-editor";
import { moveItem, QUESTION_TYPES, removeChoice, type PointsSummary, type Question } from "./types";

export function QuestionsEditor({
  questions,
  setQuestions,
  summary,
  assignmentPoints,
  customPoints,
  setCustomPoints,
  rubricTopic,
  userId,
}: {
  questions: Question[];
  setQuestions: Dispatch<SetStateAction<Question[]>>;
  summary: PointsSummary;
  assignmentPoints: number;
  customPoints: boolean;
  setCustomPoints: (custom: boolean) => void;
  rubricTopic: string;
  userId?: string;
}) {
  const questionToFocus = useRef<string>(null);
  useEffect(() => {
    if (questionToFocus.current) {
      document.getElementById(`question-${questionToFocus.current}`)?.focus();
      questionToFocus.current = null;
    }
  }, [questions]);

  const addQuestion = () => {
    const question: Question = {
      id: crypto.randomUUID(),
      text: "",
      type: "text",
      options: [],
      points: 10,
    };
    questionToFocus.current = question.id;
    setQuestions((current) => [...current, question]);
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions((current) => current.map((q) => (q.id === id ? { ...q, ...updates } : q)));
  };

  const removeQuestion = (id: string) => {
    setQuestions((current) => current.filter((q) => q.id !== id));
  };

  const addOption = (questionId: string) => {
    const question = questions.find((q) => q.id === questionId);
    if (question) {
      updateQuestion(questionId, {
        options: [...(question.options || []), ""],
      });
    }
  };

  const updateOption = (questionId: string, optionIndex: number, value: string) => {
    const question = questions.find((q) => q.id === questionId);
    if (question && question.options) {
      const newOptions = [...question.options];
      newOptions[optionIndex] = value;
      const correctAnswer =
        question.correctAnswer && question.correctAnswer === question.options[optionIndex]
          ? value
          : question.correctAnswer;
      updateQuestion(questionId, { options: newOptions, correctAnswer: correctAnswer ?? "" });
    }
  };

  const [aiGenerating, setAiGenerating] = useState<string | null>(null);

  const handleSynthesizeRubric = async (questionId: string) => {
    const question = questions.find((q) => q.id === questionId);
    if (!question || !question.text) return;

    setAiGenerating(questionId);
    try {
      const res = await authenticatedFetch("/api/ai/synthesize-rubric", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: question.text,
          topic: rubricTopic || "Physics Problem",
          userId,
        }),
      });

      if (!res.ok) {
        let errMsg = "AI failed to generate a grading rubric.";
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = `Rubric synthesis error (${res.status})`;
        }
        throw new Error(errMsg);
      }

      const { rubric } = await res.json();
      updateQuestion(questionId, { correctAnswer: rubric });
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "Failed to generate rubric.";
      toast.error(msg);
    } finally {
      setAiGenerating(null);
    }
  };

  const moveQuestion = (index: number, delta: number) => {
    setQuestions((current) => moveItem(current, index, delta));
    const id = questions[index]?.id;
    if (id) questionToFocus.current = id;
  };

  return (
    <>
      {questions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
          <div role="status" className="space-y-1">
            <p className="text-sm font-semibold tabular-nums">
              {summary.allocatedPoints} / {assignmentPoints || 0} points assigned
            </p>
            <p
              className={
                summary.pointsError ? "text-xs text-destructive" : "text-xs text-muted-foreground"
              }
            >
              {summary.pointsError ||
                (customPoints
                  ? "Custom points per question"
                  : "Points split evenly across questions")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!customPoints && !!summary.pointsError}
            onClick={() => {
              if (!customPoints) setQuestions(() => summary.scoredQuestions);
              setCustomPoints(!customPoints);
            }}
          >
            {customPoints ? "Split evenly" : "Customize points"}
          </Button>
        </div>
      )}
      {summary.scoredQuestions.map((question, index) => (
        <section
          key={question.id}
          aria-labelledby={`question-${question.id}`}
          className="overflow-hidden rounded-lg border"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 sm:px-4">
            <h3
              id={`question-${question.id}`}
              tabIndex={-1}
              className="scroll-mt-4 text-sm font-semibold"
            >
              Question {index + 1}
            </h3>
            <div className="flex items-center gap-2">
              {customPoints ? (
                <div className="flex items-center gap-2">
                  <Label htmlFor={`points-${question.id}`}>Points</Label>
                  <Input
                    id={`points-${question.id}`}
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={question.points || ""}
                    onChange={(event) =>
                      updateQuestion(question.id, {
                        points: event.target.valueAsNumber || 0,
                      })
                    }
                    className="h-8 w-16"
                  />
                </div>
              ) : (
                <Badge variant="secondary" className="tabular-nums">
                  {question.points} pts
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={index === 0}
                onClick={() => moveQuestion(index, -1)}
                aria-label={`Move question ${index + 1} up`}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={index === questions.length - 1}
                onClick={() => moveQuestion(index, 1)}
                aria-label={`Move question ${index + 1} down`}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeQuestion(question.id)}
                aria-label={`Remove question ${index + 1}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="space-y-4 p-3 sm:p-4">
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-medium">Question type</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {QUESTION_TYPES.map(({ type, label }) => (
                  <Button
                    key={type}
                    type="button"
                    variant="outline"
                    aria-pressed={question.type === type}
                    className="h-auto min-h-9 whitespace-normal px-2 aria-pressed:border-primary/60 aria-pressed:bg-primary/10 aria-pressed:text-primary"
                    onClick={() => {
                      if (type === "true-false") {
                        updateQuestion(question.id, { type, options: ["True", "False"] });
                      } else if (type === "multiple-choice" && !question.options?.length) {
                        updateQuestion(question.id, { type, options: ["", ""] });
                      } else {
                        updateQuestion(question.id, { type });
                      }
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>
            <MathInputField
              value={question.text}
              onChange={(value) => updateQuestion(question.id, { text: value })}
              ariaLabel={`Prompt for question ${index + 1}`}
              placeholder="Write the question students will see"
              rows={3}
              defaultPreviewOpen={false}
            />
            {(question.type === "text" || question.type === "short-answer") && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor={`answer-${question.id}`}>
                    {question.type === "text" ? "Grading guide" : "Expected answer"}
                    <span className="font-normal text-muted-foreground ml-1">
                      {question.type === "text" ? "(optional)" : "(required for grading)"}
                    </span>
                  </Label>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    disabled={aiGenerating === question.id || !question.text}
                    onClick={() => handleSynthesizeRubric(question.id)}
                    className="h-auto p-0 text-xs"
                  >
                    {aiGenerating === question.id ? "Generating…" : "Generate with AI"}
                  </Button>
                </div>
                <Textarea
                  id={`answer-${question.id}`}
                  value={question.correctAnswer || ""}
                  onChange={(e) => updateQuestion(question.id, { correctAnswer: e.target.value })}
                  placeholder={
                    question.type === "text"
                      ? "What should a correct response include?"
                      : "Enter an answer to use when grading"
                  }
                  rows={2}
                />
              </div>
            )}

            {question.type === "numeric" && (
              <NumericAnswerEditor
                question={question}
                onChange={(updates) => updateQuestion(question.id, updates)}
              />
            )}

            {question.type === "multiple-choice" && (
              <fieldset className="min-w-0 space-y-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <legend className="text-sm font-medium">Answer choices</legend>
                  {(!question.correctAnswer ||
                    !question.options?.some(
                      (opt) => opt.trim() && opt === question.correctAnswer,
                    )) && (
                    <span className="text-[11px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">
                      Select a correct answer
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select the radio button next to the correct answer.
                </p>
                {question.options?.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-start gap-3">
                    <input
                      type="radio"
                      name={`correct-${question.id}`}
                      aria-label={`Mark choice ${optionIndex + 1} as correct`}
                      checked={!!option.trim() && question.correctAnswer === option}
                      disabled={!option.trim()}
                      onChange={() => updateQuestion(question.id, { correctAnswer: option })}
                      className="mt-3.5 size-4 shrink-0 accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <MathInputField
                        value={option}
                        onChange={(value) => updateOption(question.id, optionIndex, value)}
                        placeholder={`Choice ${optionIndex + 1}`}
                        rows={1}
                        compact
                      />
                    </div>
                    {(question.options?.length ?? 0) > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="mt-1.5"
                        onClick={() =>
                          updateQuestion(question.id, removeChoice(question, optionIndex))
                        }
                        aria-label={`Remove choice ${optionIndex + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addOption(question.id)}
                >
                  <Plus /> Add choice
                </Button>
              </fieldset>
            )}
            {question.type === "true-false" && (
              <fieldset className="space-y-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <legend className="text-sm font-medium">Correct answer</legend>
                  {(!question.correctAnswer ||
                    (question.correctAnswer !== "True" && question.correctAnswer !== "False")) && (
                    <span className="text-[11px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">
                      Select True or False
                    </span>
                  )}
                </div>
                <RadioGroup
                  aria-label="Correct answer"
                  value={
                    typeof question.correctAnswer === "string"
                      ? question.correctAnswer.trim().toLowerCase()
                      : ""
                  }
                  onValueChange={(value) =>
                    updateQuestion(question.id, {
                      correctAnswer: value === "true" ? "True" : "False",
                    })
                  }
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="true" id={`true-${question.id}`} />
                    <Label htmlFor={`true-${question.id}`}>True</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="false" id={`false-${question.id}`} />
                    <Label htmlFor={`false-${question.id}`}>False</Label>
                  </div>
                </RadioGroup>
              </fieldset>
            )}
          </div>
        </section>
      ))}
      <div
        className={
          questions.length
            ? ""
            : "flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-7 text-center"
        }
      >
        {questions.length === 0 && (
          <p className="text-sm text-muted-foreground">No questions yet</p>
        )}
        <Button
          type="button"
          variant={questions.length ? "outline" : "default"}
          onClick={addQuestion}
        >
          <Plus />
          {questions.length ? "Add another question" : "Add a question"}
        </Button>
      </div>
    </>
  );
}
