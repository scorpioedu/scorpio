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

interface TeacherNoticeEmailProps {
  preview: string;
  greeting: string;
  paragraphs: string[];
  action: { label: string; link: string };
  footer: string;
}

/** One short message to a teacher with a single button: approval, first student, first results. */
export const TeacherNoticeEmail = ({
  preview,
  greeting,
  paragraphs,
  action,
  footer,
}: TeacherNoticeEmailProps) => {
  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>{preview}</Preview>
        <Body className="bg-zinc-50 font-sans text-zinc-900 m-0 py-8">
          <Container className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm my-10">
            <Section className="mb-6">
              <Heading className="m-0 text-xl font-bold tracking-tight text-zinc-900">
                SCORPIO
              </Heading>
            </Section>

            <Section>
              <Text className="mt-0 mb-4 text-base font-medium">{greeting}</Text>
              {paragraphs.map((p, i) => (
                <Text key={i} className="mb-4 text-base leading-relaxed text-zinc-600">
                  {p}
                </Text>
              ))}
              <Section className="mt-8 mb-4 text-center">
                <Link
                  href={action.link}
                  className="inline-block rounded-lg bg-zinc-900 px-6 py-3 text-sm font-semibold text-white no-underline"
                >
                  {action.label}
                </Link>
              </Section>
            </Section>

            <Hr className="my-8 border-zinc-200" />

            <Section>
              <Text className="text-xs leading-relaxed text-zinc-400">{footer}</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default TeacherNoticeEmail;
