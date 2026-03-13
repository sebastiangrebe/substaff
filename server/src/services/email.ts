import { Resend } from "resend";
import { logger } from "../middleware/logger.js";

let resend: Resend | null = null;
let emailFrom = "Substaff <noreply@substaff.app>";

export function initEmail(apiKey: string, from?: string) {
  resend = new Resend(apiKey);
  if (from) emailFrom = from;
  logger.info("Email service initialized (Resend)");
}

export function isEmailConfigured(): boolean {
  return resend !== null;
}

export async function sendEmail(to: string, subject: string, html: string) {
  if (!resend) {
    logger.warn({ to, subject }, "Email not configured — skipping send");
    return;
  }

  const { error } = await resend.emails.send({
    from: emailFrom,
    to,
    subject,
    html,
  });

  if (error) {
    logger.error({ to, subject, error }, "Failed to send email");
    throw new Error(`Email send failed: ${error.message}`);
  }
}
