import { Link } from "@react-email/components";
import {
  BigNumber,
  Divider,
  EmailShell,
  Eyebrow,
  Headline,
  Paragraph,
  PrimaryButton,
  SmallPrint,
  linkStyle,
} from "./components";

export interface ResultsReadyEmailProps {
  firstName: string;
  assignmentTitle: string;
  className?: string | null;
  teacherName?: string | null;
  earned: number | null;
  total: number | null;
  percent: number | null;
  link: string;
}

const round = (n: number) => String(Math.round(n * 10) / 10);

/** The teacher finished grading work that was set aside for review. Sent to the student. */
export const ResultsReadyEmail = ({
  firstName,
  assignmentTitle,
  className,
  teacherName,
  earned,
  total,
  percent,
  link,
}: ResultsReadyEmailProps) => {
  const score =
    earned !== null && total ? { value: round(earned), suffix: `/ ${round(total)}` } :
    percent !== null ? { value: `${round(percent)}%`, suffix: undefined } : null;
  const who = teacherName || "Your teacher";

  return (
    <EmailShell
      preview={`${who} finished grading ${assignmentTitle}.`}
      footer={
        <>
          You got this because you turned in {assignmentTitle} on Scorpio. To stop these emails,
          open Settings in Scorpio and turn off Assignment emails.
        </>
      }
    >
      {className ? <Eyebrow>{className}</Eyebrow> : null}
      <Headline>Your results for {assignmentTitle} are ready</Headline>
      <Paragraph>
        {firstName ? `Hi ${firstName}, ` : "Hi, "}
        {who === "Your teacher" ? "your teacher" : who} finished grading your work. You can see the score
        and feedback for each problem.
      </Paragraph>
      {score ? <BigNumber label="Score" value={score.value} suffix={score.suffix} /> : null}
      <PrimaryButton href={link}>See your results</PrimaryButton>
      <Divider />
      <SmallPrint>
        Button not working? Go to{" "}
        <Link href={link} style={linkStyle}>
          scorpioedu.org
        </Link>{" "}
        and open Grades.
        {teacherName ? ` Questions about a grade? Reply to this email to reach ${teacherName}.` : ""}
      </SmallPrint>
    </EmailShell>
  );
};

export default ResultsReadyEmail;

ResultsReadyEmail.PreviewProps = {
  firstName: "Maya",
  assignmentTitle: "Unit 3: Circular Motion",
  className: "AP Physics 1 · Period 2",
  teacherName: "Ms. Rivera",
  earned: 86,
  total: 100,
  percent: 86,
  link: "https://scorpioedu.org/student/assignment-view?id=demo&from=grades",
} satisfies ResultsReadyEmailProps;
