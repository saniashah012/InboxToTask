// Private topics: literal word and phrase blocking in backend code, before any
// model call. A match only ever withholds email; word lists never grant access.
// This is not a meaning classifier: email about a topic that uses none of its
// words can still be sent. A sender or domain block is the complete protection.

// Starter lists for the suggested topics. Saved settings copy a list when a user
// selects its topic, so editing this file changes only later selections and
// conversions. private.starter_blocked_words in the topic-blocking migration must
// match (a test compares them). No stemming: list plural and variant forms.
export const STARTER_BLOCKED_WORDS = Object.freeze({
  financial: [
    'bank statement', 'bank statements', 'account number', 'routing number', 'credit card', 'debit card',
    'credit score', 'credit report', 'loan', 'loans', 'mortgage', 'tax return', 'tax returns', 'w-2', '1099',
    'paycheck', 'pay stub', 'pay stubs', 'payroll', 'wire transfer', 'overdraft', 'balance due',
    'billing statement', 'financial aid', 'venmo', 'zelle', 'paypal',
  ],
  health: [
    'diagnosis', 'diagnoses', 'diagnosed', 'prescription', 'prescriptions', 'pharmacy', 'medication',
    'medications', 'therapist', 'therapy', 'counseling', 'mental health', 'medical', 'medical record',
    'medical records', 'lab results', 'patient portal', 'mychart', 'symptoms', 'health insurance',
    'insurance claim', 'clinic', 'hospital', 'doctor', 'doctors', 'vaccine', 'vaccination', 'surgery',
  ],
  promotions: [
    'promo code', 'promo codes', 'coupon', 'coupons', 'discount code', 'free shipping', 'limited time offer',
    'flash sale', 'shop now', 'order now', 'special offer', 'exclusive offer', 'deal ends',
  ],
  'family & friends': [
    'mom', 'dad', 'mother', 'father', 'grandma', 'grandpa', 'grandmother', 'grandfather', 'aunt', 'uncle',
    'cousin', 'sister', 'brother', 'family', 'birthday party', 'love you', 'miss you',
  ],
});

export const MAX_WORDS_PER_TOPIC = 100;
export const MAX_BLOCKED_WORDS = 1000;
const invalid = () => Object.assign(new Error('INVALID_SEMANTIC_PREFERENCES'), { code: 'INVALID_SEMANTIC_PREFERENCES' });

// Case, accents, punctuation and spacing do not matter; whole words and phrases do.
// "loan" matches "Loan!" but not "loans" or "sloane"; "w-2" matches "W 2".
export function matchText(value) {
  return ` ${String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}
// Stored form: trimmed, lowercased, inner whitespace collapsed (the SQL normalizer agrees).
export function storedWord(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
export function validWord(value) {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 100
    && !/[\x00-\x1f\x7f]/.test(value) && matchText(value).trim().length > 0;
}

// Words for each excluded topic: the saved list, else the starter list, else the
// topic name itself. Missing lists therefore err toward blocking more.
export function defaultWords(topic) {
  return [...(STARTER_BLOCKED_WORDS[topic] ?? [topic])];
}

// The matcher's terms. Every blocked word of every excluded topic, deduplicated.
export function blockedTerms(semantic) {
  if (!semantic) return [];
  const terms = new Set();
  for (const topic of semantic.exclude) {
    for (const word of semantic.blockedWords?.[topic] ?? defaultWords(topic)) {
      const term = matchText(word);
      if (term.trim()) terms.add(term);
    }
  }
  if (terms.size > MAX_BLOCKED_WORDS) throw invalid();
  return [...terms];
}

// True when any text contains any term. Never reports which one matched, so
// callers cannot log or store it.
export function containsBlockedWord(texts, terms) {
  if (!terms.length) return false;
  return texts.some(text => typeof text === 'string' && text && (() => {
    const haystack = matchText(text);
    return terms.some(term => haystack.includes(term));
  })());
}

// String values only, so JSON field names such as "deadline" never match.
export function textValues(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(textValues);
  return [];
}
