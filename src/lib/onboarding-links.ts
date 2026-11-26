export function classInvitePath(code: string) {
  return `/join/class/${encodeURIComponent(code)}`;
}

export function networkInvitePath(code: string) {
  return `/join/network/${encodeURIComponent(code)}`;
}

export function inviteAuthPath(page: "signup" | "login", kind: "class" | "network", code: string) {
  return `/${page}?${new URLSearchParams({ [kind === "class" ? "classCode" : "teacherInvite"]: code })}`;
}

/**
 * Where a student goes after signing up or in, when a link asked for a Study page or a lesson in the
 * app (`?next=`). Only those paths in this app are allowed, so `next` can never send anyone to another site or into
 * another part of the app. Anything else gives null and the usual destination is used.
 */
export function studyNextPath(next: string | null | undefined): string | null {
  if (!next || next.length > 200) return null;
  // Study's pages, or a unit (and one of its topics) in the student's lesson reader.
  const study = /^\/student\/study(\/[a-z-]+)?(\?[\w.=&%-]*)?$/;
  const reader = /^\/student\/courses\/[a-z0-9-]{1,40}\/\d{1,2}(#topic-\d{1,2}-\d{1,2})?$/;
  return study.test(next) || reader.test(next) ? next : null;
}

export const STUDY_HOME = "/student/study";
