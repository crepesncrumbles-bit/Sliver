// Text matching that works for any script (Latin, Arabic, Korean, …).
// Lowercases, drops accents/harakat, folds Arabic letter variants (أ إ آ → ا, ة → ه, ى → ي),
// removes "(…)" / "[…]" bits, and keeps only letters and digits.
function normText(s, { keepParens = false } = {}) {
  let t = String(s || '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
  t = t.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ـ/g, '');
  if (!keepParens) t = t.replace(/\(.*?\)|\[.*?\]/g, '');
  return t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
module.exports = { normText };
