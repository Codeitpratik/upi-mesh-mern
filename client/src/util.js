export const DEMO_PINS = { 'alice@demo': '1234', 'bob@demo': '2345', 'carol@demo': '3456', 'dave@demo': '4567' };

export const inr = (n, decimals = 2) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode etc. */ }
  },
};

const PALETTE = [
  ['#e0e7ff', '#4338ca'], ['#fce7f3', '#be185d'], ['#d1fae5', '#047857'],
  ['#fef3c7', '#b45309'], ['#cffafe', '#0e7490'], ['#ede9fe', '#6d28d9'],
];
export function colorFor(key = '') {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
export const initials = (name = '?') =>
  name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function fmtTime(d) {
  const date = new Date(d);
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (date.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
}

const REASONS = {
  INVALID_PIN: 'Incorrect UPI PIN',
  ACCOUNT_LOCKED: 'Account is locked after too many wrong PIN attempts. Try again later.',
  INSUFFICIENT_BALANCE: 'Insufficient balance in your account',
  decryption_failed: 'Payment data got corrupted on the way',
  stale_packet: 'Payment expired before reaching the bank (older than 24 hours)',
  future_dated: 'Payment time looks invalid',
};
export const reasonText = (r) =>
  !r ? 'Payment failed' : REASONS[r] ?? (r.startsWith('internal_error:') ? r.slice(15).trim() : r);

/** Merge server ledger + locally queued (offline) payments into one activity feed for `me`. */
export function buildItems(me, txs, outbox, accounts) {
  const nameOf = (vpa) => accounts.find((a) => a.vpa === vpa)?.holderName ?? vpa;
  const items = [];
  for (const o of outbox.filter((o) => o.sender === me)) {
    items.push({
      key: 'o' + o.packetId, dir: 'out', other: o.to, name: nameOf(o.to), amount: o.amount,
      time: o.createdAt, status: o.status === 'FAILED' ? 'FAILED' : 'PENDING', reason: o.reason,
      packetId: o.packetId,
    });
  }
  for (const t of txs) {
    const out = t.senderVpa === me;
    if (!out && t.status !== 'SETTLED') continue; // receiver never sees someone else's rejected payment
    const other = out ? t.receiverVpa : t.senderVpa;
    items.push({
      key: t.id, dir: out ? 'out' : 'in', other, name: nameOf(other), amount: t.amount,
      time: t.settledAt, status: t.status === 'SETTLED' ? 'SUCCESS' : 'FAILED', reason: t.reason, tx: t,
    });
  }
  return items.sort((a, b) => new Date(b.time) - new Date(a.time));
}

/** Apply /mesh/flush results to the local outbox. */
export function applyResults(outbox, results) {
  const byId = new Map(results.map((r) => [r.packetId, r]));
  return outbox.flatMap((o) => {
    const r = byId.get(o.packetId);
    if (!r) return [o];
    // SETTLED / REJECTED now live in the server ledger; duplicates were already handled.
    if (['SETTLED', 'REJECTED', 'DUPLICATE_DROPPED'].includes(r.outcome)) return [];
    return [{ ...o, status: 'FAILED', reason: r.reason }];
  });
}
