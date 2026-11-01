// Buy Me a Coffee → premium themes.
//
// Set up on buymeacoffee.com: Integrations → New webhook → URL https://<your site>/api/bmc/webhook,
// events donation.created, extra_purchase.created (+ the .refunded ones). Copy its signing secret
// into BMC_WEBHOOK_SECRET on Render.
//
//  • A coffee of $2 or more  → one random premium theme the buyer doesn't own yet.
//  • An "Extra" named like a theme (e.g. "Sakura Drift")  → that theme. An extra that doesn't
//    name a theme but costs at least the theme price → a random one.
//  • Refunds take the theme back.
// Themes go to the Sliver account with the buyer's email (or an email they wrote in their
// message). No account yet? It's waiting for them when they sign up with that email.
//
// Every request is signed: header x-signature-sha256 = HMAC-SHA256(raw body, secret), hex.
// Field names follow BMC's webhook docs (envelope { event_id, type, live_mode, data: {...} });
// we read a few spellings defensively since their payloads have changed over time.

const crypto = require('crypto');
const SHOP = require('../public/shop.js');

function verify(raw, signature, secret) {
  if (!secret || !signature) return false;
  const want = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const got = String(signature).trim().toLowerCase().replace(/^sha256=/, '');
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
function money(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Pull what we need out of the event, whatever shape it came in.
function read(evt) {
  const data = (evt && typeof evt.data === 'object' && evt.data) || evt || {};
  const type = String(evt.type || data.type || '').toLowerCase();
  let amount = money(data.amount ?? data.total_amount ?? data.amount_paid ?? data.price);
  if (amount === null && data.support_coffees && data.support_coffee_price) amount = Number(data.support_coffees) * money(data.support_coffee_price);
  if (amount === null && data.coffee_count && data.coffee_price) amount = Number(data.coffee_count) * money(data.coffee_price);
  const buyer = String(data.supporter_email || data.payer_email || data.email || (data.supporter && data.supporter.email) || '').trim().toLowerCase();
  const note = [data.support_note, data.message, data.note, data.supporter_message].filter(Boolean).join(' ');
  const noteEmails = (note.match(EMAIL_RE) || []).map((e) => e.toLowerCase());
  const text = JSON.stringify(data).toLowerCase();
  const themes = SHOP.PREMIUM.filter((t) => text.includes(t.name.toLowerCase())).map((t) => t.id);
  const id = String(data.id ?? data.support_id ?? data.purchase_id ?? evt.event_id ?? '');
  const refunded = /refund/.test(type) || data.refunded === true || /refund/i.test(String(data.status || ''));
  return { type, amount, buyer, noteEmails, themes, id, refunded, live: evt.live_mode !== false };
}

// Returns a summary; never throws for unknown events (BMC retries anything that isn't 2xx).
async function handleEvent(evt, { accounts, store, allowTest = false, notify = () => {} }) {
  const e = read(evt);
  if (!e.live && !allowTest) return { ignored: 'test event' };
  const base = e.type.replace(/[._](created|refunded|updated|started|purchased)$/, '');
  const recKey = `bmc:grant:${base}:${e.id}`;

  if (e.refunded) {
    const rec = e.id ? await store.cmd('GET', recKey) : null;
    if (!rec) return { ignored: 'nothing to refund' };
    const g = JSON.parse(rec);
    if (g.userId) for (const t of g.themes || []) await accounts.revokeTheme(g.userId, t);
    await store.cmd('DEL', recKey);
    if (g.userId) notify(g.userId, { text: 'A refund removed a premium theme from your account.' });
    return { revoked: g.themes || [] };
  }

  // Coffees show as "Support created" in BMC's dashboard; the event may be named donation.* or support.*.
  const coffee = /^(donation|support|one_time_support|payment|recurring_donation|membership)/.test(base);
  const extra = /^(extra|shop|product)/.test(base);
  let want = [];
  if (extra) want = e.themes.length ? e.themes : (e.amount === null || e.amount >= SHOP.PRICE ? ['random'] : []);
  else if (coffee) want = e.amount !== null && e.amount >= SHOP.COFFEE_MIN ? ['random'] : [];
  if (!want.length) return { ignored: coffee ? `coffee under $${SHOP.COFFEE_MIN}` : `not a theme purchase (${e.type})` };

  // Handle each payment once, even if BMC sends it again.
  const dedupe = `bmc:seen:${e.type}:${e.id || crypto.createHash('sha1').update(JSON.stringify(evt)).digest('hex')}`;
  if (!(await store.cmd('SET', dedupe, '1', 'NX', 'EX', 120 * 86400))) return { ignored: 'already handled' };

  // Which account? The buyer's email, else an email they typed in their note that has an account.
  const candidates = [e.buyer, ...e.noteEmails].filter(Boolean);
  if (!candidates.length) return { ignored: 'no email in the payment' };
  let email = candidates[0];
  for (const c of candidates) if (await store.cmd('GET', `email:${c}`)) { email = c; break; }

  const granted = [];
  let userId = null, pending = false;
  for (const t of want) {
    const r = await accounts.grantByEmail(email, t, `bmc:${base}`);
    userId = r.userId || userId; pending = pending || !!r.pending;
    if (r.themeId) granted.push(r.themeId);
  }
  if (e.id) await store.cmd('SET', recKey, JSON.stringify({ userId, email, themes: granted }), 'EX', 400 * 86400);
  if (userId && granted.length) {
    notify(userId, { text: `Thanks for the support! You unlocked ${granted.map((t) => SHOP.byId[t].name).join(', ')}. Find it in Settings → Theme.`, themes: granted });
  }
  return { email, userId, granted, pending };
}

module.exports = { verify, read, handleEvent };
