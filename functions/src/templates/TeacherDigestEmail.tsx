import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Link,
  Tailwind,
  Heading,
} from '@react-email/components';
import type { Digest } from '../teacher-digest-rules';

interface TeacherDigestEmailProps {
  greeting: string;
  digest: Digest;
  gradebookLink: string;
  insightsLink: string;
}

/** The weekly summary. Counts only: student names stay in the app. */
export const TeacherDigestEmail = ({
  greeting,
  digest,
  gradebookLink,
  insightsLink,
}: TeacherDigestEmailProps) => {
  const summary =
    digest.turnedInThisWeek > 0
      ? `${digest.turnedInThisWeek} ${digest.turnedInThisWeek === 1 ? "submission" : "submissions"} came in over the last 7 days.`
      : 'No work was turned in over the last 7 days.';
  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>{summary}</Preview>
        <Body className="bg-zinc-50 font-sans text-zinc-900 m-0 py-8">
          <Container className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm my-10">
            <Section className="mb-6">
              <Heading className="m-0 text-xl font-bold tracking-tight text-zinc-900">
                SCORPIO
              </Heading>
            </Section>

            <Text className="mt-0 mb-4 text-base font-medium">{greeting}</Text>
            <Text className="mb-4 text-base leading-relaxed text-zinc-600">
              {summary}
              {digest.toReview > 0
                ? ` ${digest.toReview} ${digest.toReview === 1 ? 'submission is' : 'submissions are'} waiting for your review.`
                : ''}
            </Text>

            {digest.rows.length > 0 && (
              <Section className="my-6 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
                <Text className="m-0 mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Assignments
                </Text>
                {digest.rows.map((row, i) => (
                  <Text key={i} className="m-0 mt-3 text-sm leading-relaxed text-zinc-700">
                    <strong className="font-semibold text-zinc-900">{row.title}</strong>
                    <br />
                    {row.turnedIn} of {row.enrolled} turned in · {row.due}
                    {row.behind ? ` · ${row.enrolled - row.turnedIn} missing` : ''}
                  </Text>
                ))}
              </Section>
            )}

            {digest.misconceptions.length > 0 && (
              <Section className="my-6 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
                <Text className="m-0 mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Most common mistakes this week
                </Text>
                {digest.misconceptions.map((m, i) => (
                  <Text key={i} className="m-0 mt-3 text-sm leading-relaxed text-zinc-700">
                    {m.label} · {m.students} {m.students === 1 ? 'student' : 'students'}
                  </Text>
                ))}
                <Text className="m-0 mt-4 text-sm">
                  <Link href={insightsLink} className="text-zinc-900 underline">
                    See which questions and who
                  </Link>
                </Text>
              </Section>
            )}

            <Section className="mt-8 mb-4 text-center">
              <Link
                href={gradebookLink}
                className="inline-block rounded-lg bg-zinc-900 px-6 py-3 text-sm font-semibold text-white no-underline"
              >
                Open the Gradebook
              </Link>
            </Section>

            <Hr className="my-8 border-zinc-200" />
            <Text className="text-xs leading-relaxed text-zinc-400">
              Sent on Mondays, and only when there is something to report. To stop it, open
              Settings in Scorpio and turn off Weekly summary email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default TeacherDigestEmail;
