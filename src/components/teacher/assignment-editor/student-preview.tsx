"use client";

// What students will see: instructions, questions and points (no answers).
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import type { Question } from "./types";

export function StudentPreviewContent({
  title,
  description,
  dueDate,
  totalPoints,
  timeLimit,
  questions,
  onClose,
  subtitle = "Review the instructions, questions, and points before creating the assignment.",
}: {
  title: string;
  description: string;
  dueDate: Date | null | undefined;
  totalPoints: number;
  timeLimit: number | "";
  questions: Question[];
  onClose: () => void;
  subtitle?: string;
}) {
  return (
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Student preview</DialogTitle>
        <DialogDescription>{subtitle}</DialogDescription>
      </DialogHeader>

      <div className="space-y-8 py-4">
        <div className="space-y-2 border-b pb-6">
          <h2 className="text-3xl font-bold tracking-tight">{title || "Untitled Assignment"}</h2>
          <p className="text-muted-foreground">{description || "No description provided."}</p>
          <div className="flex flex-wrap gap-4 text-xs font-medium uppercase tracking-tighter text-muted-foreground pt-2">
            <span>{dueDate ? `Due ${dueDate.toLocaleString()}` : "No due date"}</span>
            {totalPoints > 0 && <span>{totalPoints} points total</span>}
            {timeLimit && <span>Time Limit: {timeLimit} mins</span>}
          </div>
        </div>

        <div className="space-y-6">
          {questions.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed rounded-xl">
              <p className="text-muted-foreground italic">No questions added yet.</p>
            </div>
          ) : (
            questions.map((question, index) => (
              <Card key={question.id} className="overflow-hidden">
                <CardHeader className="bg-muted/30 pb-4">
                  <div className="flex justify-between items-start">
                    <h3 className="text-base font-semibold">Question {index + 1}</h3>
                    <Badge variant="outline" className="font-mono">
                      {question.points} PTS
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <MarkdownRenderer>
                    {question.text || "*No question text entered.*"}
                  </MarkdownRenderer>

                  <div className="space-y-3">
                    {question.type === "multiple-choice" && (
                      <div className="grid gap-2">
                        {question.options?.map((option, oIdx) => (
                          <div
                            key={oIdx}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                          >
                            <div className="w-4 h-4 rounded-full border border-muted-foreground/50" />
                            <MarkdownRenderer className="text-sm prose-p:my-0">
                              {option || `Option ${oIdx + 1}`}
                            </MarkdownRenderer>
                          </div>
                        ))}
                      </div>
                    )}
                    {question.type === "true-false" && (
                      <div className="grid gap-2">
                        {["True", "False"].map((option) => (
                          <div
                            key={option}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                          >
                            <div className="w-4 h-4 rounded-full border border-muted-foreground/50" />
                            <span className="text-sm">{option}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {question.type === "numeric" && (
                      <div className="p-4 rounded-lg border border-dashed bg-muted/30 text-muted-foreground text-sm italic">
                        Student will enter a number with its unit, like 12.5 m/s.
                      </div>
                    )}
                    {(question.type === "text" || question.type === "short-answer") && (
                      <div className="p-4 rounded-lg border border-dashed bg-muted/30 text-muted-foreground text-sm italic">
                        Student will provide a {question.type === "short-answer" ? "short" : "long"}
                        -form response.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t">
        <Button onClick={onClose} variant="default" className="w-full sm:w-auto">
          Close preview
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
