// Sends the 6-digit codes for sign-up and password reset.
//
// Set these on Render (Environment) to turn email codes on:
//   BREVO_API_KEY  — from brevo.com (free: 300 emails a day), Settings → SMTP & API → API keys
//   MAIL_FROM      — the sender address you verified in Brevo (a Gmail address works)
// or, instead of Brevo: RESEND_API_KEY + MAIL_FROM (needs your own domain on resend.com).
// With neither set, accounts are created right away without a code (fine on a laptop).

const { cleanEnv } = require('./store');

function codeEmail(code, purpose) {
  const what = purpose === 'reset' ? 'reset your Sliver password' : 'finish signing up for Sliver';
  const text = `Your Sliver code is ${code}\n\nEnter it to ${what}. It expires in 15 minutes.\nIf you didn't ask for this, you can ignore this email.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#14123A">
    <div style="font-size:22px;font-weight:800;margin-bottom:12px">Sliver</div>
    <p style="margin:0 0 16px">Enter this code to ${what}:</p>
    <div style="font-size:36px;font-weight:800;letter-spacing:8px;background:#F1F0FB;border-radius:12px;padding:16px;text-align:center">${code}</div>
    <p style="margin:16px 0 0;color:#5E5B85;font-size:14px">It expires in 15 minutes. If you didn't ask for this, you can ignore this email.</p>
  </div>`;
  return { subject: `Your Sliver code: ${code}`, text, html };
}

function createMailer(env = process.env) {
  const from = cleanEnv(env.MAIL_FROM, 'MAIL_FROM');
  const brevo = cleanEnv(env.BREVO_API_KEY, 'BREVO_API_KEY');
  const resend = cleanEnv(env.RESEND_API_KEY, 'RESEND_API_KEY');
  if (!from || !(brevo || resend)) return null;

  const send = async ({ to, subject, text, html }) => {
    let res;
    if (brevo) {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevo, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { name: 'Sliver', email: from }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
      });
    } else {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `Sliver <${from}>`, to: [to], subject, html, text }),
      });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Email service said HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
  };

  return {
    kind: brevo ? 'brevo' : 'resend',
    from,
    sendCode: (to, code, purpose) => send({ to, ...codeEmail(code, purpose) }),
  };
}

module.exports = { createMailer, codeEmail };
