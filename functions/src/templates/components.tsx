import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { LOGO_URL, SITE, colors, font } from "./theme";

/**
 * The frame every email sits in: logo, one dark card, and a footer that says why the reader got it.
 * Inline styles only, because Gmail strips <style> blocks and class names.
 */
export function EmailShell({
  preview,
  children,
  footer,
}: {
  preview: string;
  children: React.ReactNode;
  /** Why this email was sent and how to stop it. */
  footer: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Tells Apple Mail and Outlook the email is already dark, so they do not invert it. */}
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.page,
          margin: 0,
          padding: "32px 12px",
          fontFamily: font,
          color: colors.text,
        }}
      >
        <Container style={{ maxWidth: 520, margin: "0 auto" }}>
          <Section style={{ padding: "0 4px 20px" }}>
            <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: "middle", paddingRight: 10 }}>
                    <Img src={LOGO_URL} width="26" height="26" alt="" />
                  </td>
                  <td
                    style={{
                      verticalAlign: "middle",
                      fontSize: 19,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      color: colors.text,
                      fontFamily: font,
                    }}
                  >
                    Scorpio
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: "32px 32px 28px",
            }}
          >
            {children}
          </Section>

          <Section style={{ padding: "20px 8px 0" }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: colors.faint }}>
              {footer}
            </Text>
            <Text style={{ margin: "10px 0 0", fontSize: 12, lineHeight: "18px", color: colors.faint }}>
              <Link href={SITE} style={{ color: colors.faint, textDecoration: "underline" }}>
                scorpioedu.org
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** Small violet label above the headline, e.g. the class name. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        margin: "0 0 10px",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: colors.accentText,
      }}
    >
      {children}
    </Text>
  );
}

export function Headline({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        margin: "0 0 16px",
        fontSize: 24,
        lineHeight: "31px",
        fontWeight: 700,
        letterSpacing: "-0.015em",
        color: colors.text,
      }}
    >
      {children}
    </Text>
  );
}

export function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ margin: "0 0 14px", fontSize: 15, lineHeight: "24px", color: colors.body }}>
      {children}
    </Text>
  );
}

/** The one thing to click. Every email has at most one. */
export function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Section style={{ margin: "26px 0 6px" }}>
      <Button
        href={href}
        style={{
          backgroundColor: colors.primary,
          color: colors.primaryText,
          borderRadius: 10,
          padding: "13px 22px",
          fontSize: 15,
          fontWeight: 600,
          textDecoration: "none",
          display: "inline-block",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

/** Label/value rows in a quiet panel: due date, problems, class. Rows with no value are left out. */
export function Details({ rows }: { rows: Array<[string, string | null | undefined]> }) {
  const shown = rows.filter((r): r is [string, string] => Boolean(r[1]));
  if (shown.length === 0) return null;
  return (
    <Section
      style={{
        backgroundColor: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: "6px 18px",
        margin: "20px 0 4px",
      }}
    >
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tbody>
          {shown.map(([label, value], i) => (
            <tr key={label}>
              <td
                style={{
                  padding: "10px 0",
                  borderTop: i === 0 ? "none" : `1px solid ${colors.border}`,
                  fontSize: 13,
                  color: colors.muted,
                  width: "38%",
                  verticalAlign: "top",
                }}
              >
                {label}
              </td>
              <td
                style={{
                  padding: "10px 0",
                  borderTop: i === 0 ? "none" : `1px solid ${colors.border}`,
                  fontSize: 14,
                  fontWeight: 600,
                  color: colors.text,
                  textAlign: "right",
                  verticalAlign: "top",
                }}
              >
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/** A big number in a tinted panel: a score, or a count in the digest. */
export function BigNumber({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <Section
      style={{
        backgroundColor: colors.accentPanel,
        borderRadius: 12,
        padding: "18px 20px",
        margin: "20px 0 4px",
      }}
    >
      <Text
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: colors.accentText,
        }}
      >
        {label}
      </Text>
      <Text style={{ margin: "6px 0 0", fontSize: 34, lineHeight: "40px", fontWeight: 700, color: colors.text }}>
        {value}
        {suffix ? (
          <span style={{ fontSize: 17, fontWeight: 500, color: colors.muted }}> {suffix}</span>
        ) : null}
      </Text>
    </Section>
  );
}

/** A titled list in a panel, used by the digest. */
export function ListPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Section
      style={{
        backgroundColor: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: "14px 18px",
        margin: "18px 0 4px",
      }}
    >
      <Text
        style={{
          margin: "0 0 4px",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: colors.muted,
        }}
      >
        {title}
      </Text>
      {children}
    </Section>
  );
}

export function ListItem({ title, detail }: { title?: string; detail: React.ReactNode }) {
  return (
    <Text style={{ margin: "10px 0 0", fontSize: 14, lineHeight: "21px", color: colors.body }}>
      {title ? (
        <>
          <span style={{ fontWeight: 600, color: colors.text }}>{title}</span>
          <br />
        </>
      ) : null}
      {detail}
    </Text>
  );
}

export function Divider() {
  return <Hr style={{ borderColor: colors.border, borderTopWidth: 1, margin: "24px 0 18px" }} />;
}

/** Small print inside the card, under a divider: the fallback link or a note. */
export function SmallPrint({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: colors.muted }}>{children}</Text>
  );
}

export const linkStyle = { color: colors.accentText, textDecoration: "underline" } as const;
