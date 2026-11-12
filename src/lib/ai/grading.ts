import { model } from "./config";
import { scrubPII, classifyQuestion } from "./utils";
import { gradeWithModel } from "../../../functions/src/grading-schema";

export async function gradeResponse(
  question: string,
  answer: string,
  rubric?: string,
  studentNames: string[] = []
): Promise<{
  score: number,
  feedback: string,
  reasoning?: string,
  usage?: { inputTokens: number, outputTokens: number },
  /** True when the reply must not be auto-finalised (suspected injection, implausible full marks). */
  needsReview?: boolean,
  reviewReason?: string
}> {
  try {
    // Basic verification of inputs
    if (!question || !answer) {
      return { score: 0, feedback: "Missing question or answer text for grading." };
    }

    return await gradeWithModel(
      { question, answer, rubric },
      async ({ systemInstruction, userPrompt }) => {
        const result = await model.generateContent({
          systemInstruction,
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.1,
            responseMimeType: "application/json",
          }
        });
        const response = await result.response;
        let text = "";
        try {
          text = response.text();
        } catch (textError) {
          // Check if it's a safety block
          if (response.candidates && response.candidates[0]?.finishReason === 'SAFETY') {
            throw new Error("Response blocked; manual review required");
          }
          throw textError;
        }
        return {
          text,
          usage: {
            inputTokens: response.usageMetadata?.promptTokenCount || 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount || 0
          }
        };
      },
      { scrub: (text) => scrubPII(text, studentNames), defaultFeedback: "No feedback provided." }
    );
  } catch (error: unknown) {
    console.error("Error in gradeResponse:", error instanceof Error ? error.message : String(error));
    throw new Error("AI grading unavailable; manual review required");
  }
}

export async function synthesizeRubric(questionText: string, topic: string): Promise<{ text: string, usage?: { inputTokens: number, outputTokens: number } }> {
  try {
    const prompt = `
      You are an academic curriculum assistant.
      Your task is to create a detailed Scoring Guide for a question about "${topic}".

      QUESTION: "${questionText}"

      Please provide:
      1. Essential Concepts: What must the student demonstrate understanding of?
      2. Scoring Breakdown: What specific elements earn points?
      3. Common Mistakes: What should be penalized?
      4. Model Answer: An ideal response.

      Use clear Markdown. Be professional and constructive.
    `;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
      }
    });
    const response = await result.response;
    return {
      text: response.text(),
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      }
    };
  } catch (error) {
    console.error("Error synthesizing rubric:", error);
    return { text: "Failed to synthesize rubric. Please provide manual guidelines." };
  }
}

export interface ValidationResult {
  passed: boolean;
  violations: string[];
}

export function validateResponse(response: string, question?: string): ValidationResult {
  const violations: string[] = [];
  const questionType = question ? classifyQuestion(question) : 'declarative'; // Default if no question provided

  // Only check for direct answers in problem-solving contexts
  if (questionType === 'problem-solving') {
    // Check for direct numerical answers without guidance
    const hasNumbers = /\d+\.?\d*/.test(response);
    const hasGuidance = /step|explain|why|how|think|consider/i.test(response);
    if (hasNumbers && !hasGuidance) {
      violations.push("Direct numerical answer without guidance");
    }
  }

  // Check for missing units on numerical values (always apply)
  const numbersWithoutUnits = response.match(/\d+\.?\d*(?!\s*[a-zA-Z²³°%])/g);
  if (numbersWithoutUnits && numbersWithoutUnits.length > 0) {
    violations.push("Missing units on numerical values");
  }

  // Check for missing vector notation when discussing vectors (always apply)
  if (response.toLowerCase().includes("vector") && !response.includes("\\vec{")) {
    violations.push("Missing vector notation when discussing vectors");
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
