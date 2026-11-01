import nodemailer from 'nodemailer';

// Real SMTP email delivery for production. This is intentionally separate
// from server/db.ts's sendNotification() (which manages the in-app
// notification feed / dev-only "simulated email" inbox) - this module's
// only job is actually putting a message in someone's real inbox.
//
// Configuration is a standard SMTP config (works with SendGrid, Mailgun,
// Amazon SES, Gmail SMTP, Postmark, or any other SMTP-compatible provider -
// no vendor-specific SDK required).

let cachedTransporter: nodemailer.Transporter | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  return cachedTransporter;
}

// Sends a real email. Throws if SMTP isn't configured - callers must check
// isEmailConfigured() first and fail the request cleanly rather than
// letting this throw turn into an unhandled 500. Never logs the message
// body (which may contain an OTP) - only success/failure and the
// recipient address.
export async function sendRealEmail(to: string, subject: string, text: string, html?: string): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error('Email service is not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD missing)');
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html: html || `<p>${text.replace(/\n/g, '<br/>')}</p>`,
  });

  console.log(`Email sent to ${to}: "${subject}"`); // never logs body/OTP content
}
