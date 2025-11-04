import nodemailer from 'nodemailer';

function hasSmtp() {
  return !!process.env.SMTP_HOST;
}

export function makeTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
}

export async function sendMail({ to, subject, html }) {
  const from = process.env.MAIL_FROM || '"Navio AI" <no-reply@example.com>';

  if (!hasSmtp()) {
    // DEV: Kein SMTP konfiguriert → in Konsole ausgeben
    console.log('──────────────── DEV MAIL ────────────────');
    console.log('To:      ', to);
    console.log('Subject: ', subject);
    console.log('HTML:\n', html);
    console.log('──────────────────────────────────────────');
    return { messageId: 'dev-log' };
  }

  const transporter = makeTransport();
  return transporter.sendMail({ from, to, subject, html });
}
