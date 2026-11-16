/**
 * An error whose message was written for the end user (validation or business-rule text such as
 * "Class code already exists"). It is the only kind of error message that API routes may put in a
 * response body; everything else is logged server-side and replaced by generic text (RT-17, C-009).
 */
export class ClientError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'ClientError';
  }
}
