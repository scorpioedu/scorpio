import { EmailShell, Headline, Paragraph, PrimaryButton } from "./components";

interface TeacherNoticeEmailProps {
  preview: string;
  /** Optional large headline above the greeting. */
  headline?: string;
  greeting: string;
  paragraphs: string[];
  action: { label: string; link: string };
  footer: string;
}

/** One short message to a teacher with a single button: approval, first student, first results. */
export const TeacherNoticeEmail = ({
  preview,
  headline,
  greeting,
  paragraphs,
  action,
  footer,
}: TeacherNoticeEmailProps) => {
  return (
    <EmailShell preview={preview} footer={footer}>
      {headline ? <Headline>{headline}</Headline> : null}
      <Paragraph>{greeting}</Paragraph>
      {paragraphs.map((p, i) => (
        <Paragraph key={i}>{p}</Paragraph>
      ))}
      <PrimaryButton href={action.link}>{action.label}</PrimaryButton>
    </EmailShell>
  );
};

export default TeacherNoticeEmail;

TeacherNoticeEmail.PreviewProps = {
  preview: "Your access code is ready. Create your teacher account.",
  headline: "Your access is approved",
  greeting: "Hi Dana,",
  paragraphs: [
    "Thanks for your interest in Scorpio. Your access request is approved.",
    "The button below opens the teacher signup with your access code already filled in. Setting up a class and assigning a first unit takes about five minutes.",
  ],
  action: { label: "Create your teacher account", link: "https://scorpioedu.org/signup" },
  footer: "The code works once and expires in 60 days. Reply to this email if anything gets in the way.",
} satisfies TeacherNoticeEmailProps;
