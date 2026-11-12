/**
 * Typed AI failures (RT-17, F-003). AI helpers throw these instead of returning failure text as if it were
 * model output; routes map them with `errorResponse` (src/lib/api-errors.ts) to a status and a generic,
 * client-safe message. `message` is for server logs and must never carry provider bodies or user content.
 */
export class AiError extends Error {
  constructor(message: string, readonly status: number, readonly publicMessage: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The budget reservation for a call was refused or could not be made. */
export class AiBudgetError extends AiError {
  constructor(message: string) {
    super(message, 503, "AI is unavailable for your network right now (budget reached or unavailable). Please try again later or contact your teacher.");
    this.name = 'AiBudgetError';
  }
}

/** The provider call failed: network error, timeout, non-2xx status or an unreadable response body. */
export class AiProviderError extends AiError {
  constructor(message: string) {
    super(message, 502, "The AI service had a problem. Please try again.");
    this.name = 'AiProviderError';
  }
}

/** The provider answered but the output was empty, blocked or not in the expected shape. */
export class AiOutputError extends AiError {
  constructor(message: string, publicMessage = "The AI returned an unusable response. Please try again.") {
    super(message, 502, publicMessage);
    this.name = 'AiOutputError';
  }
}

/** The request cannot be sent to the model (for example it is too large); `message` is safe to show. */
export class AiInputError extends AiError {
  constructor(message: string) {
    super(message, 413, message);
    this.name = 'AiInputError';
  }
}
