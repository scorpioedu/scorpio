import { Link } from "@react-email/components";
import type { Digest } from "../teacher-digest-rules";
import {
  BigNumber,
  EmailShell,
  Headline,
  ListItem,
  ListPanel,
  Paragraph,
  PrimaryButton,
  linkStyle,
} from "./components";

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
      : "No work was turned in over the last 7 days.";
  return (
    <EmailShell
      preview={summary}
      footer="Sent on Mondays, and only when there is something to report. To stop it, open Settings in Scorpio and turn off Weekly summary email."
    >
      <Headline>Your week on Scorpio</Headline>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>{summary}</Paragraph>

      {digest.toReview > 0 ? (
        <BigNumber label="Waiting for your review" value={String(digest.toReview)} />
      ) : null}

      {digest.rows.length > 0 && (
        <ListPanel title="Assignments">
          {digest.rows.map((row, i) => (
            <ListItem
              key={i}
              title={row.title}
              detail={
                <>
                  {row.turnedIn} of {row.enrolled} turned in · {row.due}
                  {row.behind ? ` · ${row.enrolled - row.turnedIn} missing` : ""}
                </>
              }
            />
          ))}
        </ListPanel>
      )}

      {digest.misconceptions.length > 0 && (
        <ListPanel title="Most common mistakes this week">
          {digest.misconceptions.map((m, i) => (
            <ListItem
              key={i}
              detail={`${m.label} · ${m.students} ${m.students === 1 ? "student" : "students"}`}
            />
          ))}
          <ListItem
            detail={
              <Link href={insightsLink} style={linkStyle}>
                See which questions and who
              </Link>
            }
          />
        </ListPanel>
      )}

      <PrimaryButton href={gradebookLink}>Open the Gradebook</PrimaryButton>
    </EmailShell>
  );
};

export default TeacherDigestEmail;

TeacherDigestEmail.PreviewProps = {
  greeting: "Hi Dana,",
  gradebookLink: "https://scorpioedu.org/teacher/grades",
  insightsLink: "https://scorpioedu.org/teacher/insights",
  digest: {
    turnedInThisWeek: 46,
    toReview: 3,
    rows: [
      { title: "Unit 3: Circular Motion", turnedIn: 24, enrolled: 28, due: "Due Wed, Nov 25", behind: false },
      { title: "Unit 2: Forces", turnedIn: 22, enrolled: 28, due: "Was due Sat, Nov 21", behind: true },
    ],
    misconceptions: [
      { label: "Treats centripetal force as a separate force", students: 9 },
      { label: "Drops the sign on acceleration", students: 5 },
    ],
  },
} satisfies TeacherDigestEmailProps;
