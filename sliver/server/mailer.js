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

// Turns the email service's error into a plain-English fix for the Render logs.
function hintFor(status, body) {
  const b = String(body || '').toLowerCase();
  if (b.includes('unrecognised ip') || b.includes('unrecognized ip') || b.includes('authorised ip') || b.includes('authorized ip'))
    return 'Brevo is blocking Render\'s IP address. In Brevo: account menu → Security → Authorized IPs → turn OFF "IP blocking" (Render\'s IPs change, so you can\'t list them).';
  if (b.includes('key not found') || status === 401)
    return 'The API key is wrong. Re-copy it from Brevo (SMTP & API → API Keys, starts with xkeysib-) into BREVO_API_KEY on Render — no quotes or spaces.';
  if (b.includes('sender') && (b.includes('not valid') || b.includes('invalid') || b.includes('not verified')))
    return 'MAIL_FROM must exactly match a sender marked Verified in Brevo (Senders, Domains & Dedicated IPs → Senders).';
  if (b.includes('not yet activated') || b.includes('not activated') || b.includes('suspended') || b.includes('validation'))
    return 'Your Brevo account isn\'t cleared to send yet. Check your Brevo inbox/dashboard for an activation or validation request.';
  if (status === 402 || b.includes('credit'))
    return 'Brevo says you\'re out of free emails for today (300/day).';
  return '';
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
      const hint = hintFor(res.status, body);
      throw new Error(`Email service said HTTP ${res.status}: ${body.slice(0, 300)}${hint ? '\n  → FIX: ' + hint : ''}`);
    }
  };

  // Startup check: is the key accepted, and is MAIL_FROM a verified sender?
  const check = async () => {
    if (!brevo) return 'resend (not checked)';
    const headers = { 'api-key': brevo, Accept: 'application/json' };
    const res = await fetch('https://api.brevo.com/v3/account', { headers });
    const body = await res.text().catch(() => '');
    if (!res.ok) {
      const hint = hintFor(res.status, body);
      throw new Error(`Brevo HTTP ${res.status}: ${body.slice(0, 200)}${hint ? '\n  → FIX: ' + hint : ''}`);
    }
    let note = 'key OK ✓';
    try {
      const s = await fetch('https://api.brevo.com/v3/senders', { headers });
      if (s.ok) {
        const list = (await s.json()).senders || [];
        const me = list.find((x) => String(x.email).toLowerCase() === from.toLowerCase());
        if (!me) note += `, but ⚠ ${from} is not in your Brevo senders (have: ${list.map((x) => x.email).join(', ') || 'none'}) → set MAIL_FROM to one of those`;
        else if (me.active === false) note += `, but ⚠ sender ${from} is not verified yet in Brevo`;
        else note += `, sender ${from} verified ✓`;
      }
    } catch { /* sender list is just a bonus */ }
    return note;
  };

  return {
    kind: brevo ? 'brevo' : 'resend',
    from,
    check,
    sendCode: (to, code, purpose) => send({ to, ...codeEmail(code, purpose) }),
  };
}

module.exports = { createMailer, codeEmail, hintFor };
