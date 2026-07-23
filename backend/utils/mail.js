import { Resend } from 'resend';

const FROM = 'PeteZah <no-reply@verify.petezahgames.com>';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || typeof key !== 'string' || key.length < 10) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(key);
}

export async function sendVerificationEmail(to, verifyUrl) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: [to],
    subject: 'Verify your PeteZah email',
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#e8f0fa;background:#0a1220;border-radius:12px">
        <h1 style="font-size:18px;margin:0 0 12px">Verify your email</h1>
        <p style="font-size:14px;line-height:1.5;color:#a8b8cc;margin:0 0 20px">
          Confirm this address to finish setting up your PeteZah account and unlock Get Links.
        </p>
        <a href="${verifyUrl}" style="display:inline-block;padding:10px 18px;background:#2b6cb0;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
          Verify email
        </a>
        <p style="font-size:12px;color:#6b7c90;margin:20px 0 0;line-height:1.4">
          This link expires in 24 hours. If you did not create an account, you can ignore this email.
        </p>
      </div>
    `,
    text: `Verify your PeteZah email:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
  });
  if (error) throw new Error(error.message || 'Failed to send email');
}
