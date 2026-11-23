import { Link } from "@react-email/components";
import {
  Details,
  Divider,
  EmailShell,
  Eyebrow,
  Headline,
  Paragraph,
  PrimaryButton,
  SmallPrint,
  linkStyle,
} from "./components";

export interface AssignmentEmailProps {
  /** "new": just assigned. "reminder": due within a day and not turned in yet. */
  kind?: "new" | "reminder";
  firstName: string;
  assignmentTitle: string;
  className?: string | null;
  teacherName?: string | null;
  /** "Wed, Nov 25 at 11:59 PM PST", or null when there is no due date. */
  due?: string | null;
  /** "today" or "tomorrow", for reminders. */
  dueDay?: string;
  problems?: number;
  link: string;
}

/** A new assignment, or a reminder that one is due soon. Sent to students. */
export const AssignmentCreatedEmail = ({
  kind = "new",
  firstName,
  assignmentTitle,
  className,
  teacherName,
  due,
  dueDay = "tomorrow",
  problems,
  link,
}: AssignmentEmailProps) => {
  const reminder = kind === "reminder";
  const preview = reminder
    ? `${assignmentTitle} is due ${dueDay}${due ? `, ${due}` : ""}. You haven't turned it in yet.`
    : `${assignmentTitle}${due ? `, due ${due}` : ""}.`;

  return (
    <EmailShell
      preview={preview}
      footer={
        <>
          You got this because you're in {className || "a class"} on Scorpio. To stop these emails,
          open Settings in Scorpio and turn off Assignment emails.
        </>
      }
    >
      {className ? <Eyebrow>{className}</Eyebrow> : null}
      <Headline>
        {reminder ? `${assignmentTitle} is due ${dueDay}` : assignmentTitle}
      </Headline>
      <Paragraph>
        {firstName ? `Hi ${firstName}, ` : "Hi, "}
        {reminder
          ? "you haven't turned this in yet. There's still time to finish it."
          : teacherName
            ? `${teacherName} assigned new work on Scorpio.`
            : "you have new work waiting on Scorpio."}
      </Paragraph>
      <Details
        rows={[
          ["Due", due ?? "No due date"],
          ["Problems", problems ? String(problems) : null],
          ["Teacher", teacherName],
        ]}
      />
      <PrimaryButton href={link}>{reminder ? "Finish the assignment" : "Open the assignment"}</PrimaryButton>
      <Divider />
      <SmallPrint>
        Button not working? Go to{" "}
        <Link href={link} style={linkStyle}>
          scorpioedu.org
        </Link>{" "}
        and open Assignments.
        {teacherName ? ` Questions about the work? Reply to this email to reach ${teacherName}.` : ""}
      </SmallPrint>
    </EmailShell>
  );
};

export default AssignmentCreatedEmail;

AssignmentCreatedEmail.PreviewProps = {
  kind: "new",
  firstName: "Maya",
  assignmentTitle: "Unit 3: Circular Motion",
  className: "AP Physics 1 · Period 2",
  teacherName: "Ms. Rivera",
  due: "Wed, Nov 25 at 11:59 PM PST",
  problems: 10,
  link: "https://scorpioedu.org/student/assignment-view?id=demo",
} satisfies AssignmentEmailProps;
