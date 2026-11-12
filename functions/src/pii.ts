/**
 * Single implementation of PII scrubbing and log redaction (RT-10, C-008/K-004).
 * Imported by src/lib/ai (via utils.ts) and by the Cloud Functions; do not copy it.
 * RT-27 will move this into a shared package.
 */

// Matches the placeholders scrubPII emits. Capturing group keeps them in split() output.
const PLACEHOLDER = /(\[(?:EMAIL|PHONE|ID|STUDENT_ID|ADDRESS|BIRTH_DATE|DATE|SENSITIVE|NAME)\])/;

/**
 * Scorpio's own published support addresses. They appear in our trusted prompts (CONTACT_CONSTRAINT,
 * the landing prompt) so the assistant can point users at support; they are not personal data.
 * Exact matches only.
 */
const PUBLIC_CONTACT_EMAILS = new Set(["rushil@scorpioedu.org"]);

/**
 * Scrubs Personal Identifiable Information (PII) from text before sending to LLM.
 * Targets: Emails, common phone numbers, addresses, and potential ID patterns.
 * This is a critical compliance step for FERPA/COPPA.
 * 
 * @param text The input string to scrub
 * @param studentNames Optional list of names to mask (e.g., student roster)
 * @param level 'full' (default) applies every pattern. 'contact' applies only emails and supplied
 *   names, for teacher-authored content (assignments, rubrics) where dates, long decimals and
 *   number lists are legitimate and were never scrubbed.
 */
export type ScrubLevel = 'full' | 'contact';

export function scrubPII(text: string, studentNames: string[] = [], level: ScrubLevel = 'full'): string {
  if (!text) return text;
  
  // Email addresses
  let scrubbed = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (m) => (PUBLIC_CONTACT_EMAILS.has(m.toLowerCase()) ? m : "[EMAIL]"));

  if (level === 'full') scrubbed = scrubbed
    // Improved Phone numbers: requires some form of separator or parentheses to avoid matching 10-digit physics values
    // Matches: (123) 456-7890, 123-456-7890, 123.456.7890, +1 123 456 7890
    .replace(/(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g, "[PHONE]")
    
    // Generic ID patterns (e.g. SSN-like 9-digit patterns)
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ID]")
    
    // Student ID Patterns (Customizable but targets common school formats)
    // Matches: ID: 1234567, Student #123456
    .replace(/\b(ID|Student\s?#?|ID\s?#?):?\s?\d{5,9}\b/gi, "[STUDENT_ID]")
    
    // Simple Address pattern (Street/Ave/Building etc.)
    .replace(/\b\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Ter|Terrace|Way)\.?\b/gi, "[ADDRESS]")
    
    // Date of birth pattern (matches near DOB keywords)
    .replace(/(?:DOB|Birth|Born)(?:\s+on)?\s*[:\-]?\s*(\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b[A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}\b)/gi, "[BIRTH_DATE]")
    .replace(/\b(19|20)\d{2}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/g, "[DATE]") // Specific YYYY-MM-DD
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-](19|20)\d{2}\b/g, "[DATE]") // Specific MM/DD/YYYY
    
    // Credit card numbers (Simple 13-16 digit check)
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, "[SENSITIVE]");

  // Mask student names if provided (case-insensitive)
  if (studentNames.length > 0) {
    // Collect all name parts to catch "First Last", "First", or "Last" independently
    const nameParts = new Set<string>();
    studentNames.forEach(fullName => {
      if (!fullName) return;
      nameParts.add(fullName);
      const split = fullName.split(/\s+/);
      if (split.length > 1) {
        split.forEach(part => {
          if (part.length > 2 && !['and', 'the', 'with'].includes(part.toLowerCase())) {
            nameParts.add(part);
          }
        });
      }
    });

    // Sort by length descending to catch full names before part names
    const sortedParts = Array.from(nameParts).sort((a, b) => b.length - a.length);

    // Placeholders from an earlier pass are left alone so scrubbing is idempotent
    // (a roster name such as "Name" must not turn "[NAME]" into "[[NAME]]").
    const segments = scrubbed.split(PLACEHOLDER);
    sortedParts.forEach((name) => {
      if (name && name.length > 2) {
        // Create regex for the name with word boundaries
        const nameRegex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        for (let i = 0; i < segments.length; i += 2) segments[i] = segments[i].replace(nameRegex, "[NAME]");
      }
    });
    scrubbed = segments.join('');
  }

  return scrubbed;
}

/**
 * Masks an email for logs: "jane.doe@example.com" -> "j***@example.com".
 * Anything that is not a plain address becomes "[redacted]" so odd input never leaks.
 */
export function maskEmail(email: unknown): string {
  if (typeof email !== 'string') return '[redacted]';
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return '[redacted]';
  return `${email[0]}***${email.slice(at)}`;
}

