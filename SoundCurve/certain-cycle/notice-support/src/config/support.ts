/**
 * support.ts — everything the /support page needs. Any EMPTY value hides that element,
 * so there is never a dead button. Fill these in when you choose the platform.
 */
export const SUPPORT = {
  coffeeUrl: '',                        // e.g. your Buy Me a Coffee / Ko-fi page. Empty = button hidden.
  tiers: [                              // suggestions only; they all open coffeeUrl
    { emoji: '🍵', name: 'A chai', price: '', note: 'Covers a day of hosting.' },
    { emoji: '☕', name: 'A coffee', price: '', note: 'Keeps the domain and email running.', popular: true },
    { emoji: '🥪', name: 'A long night', price: '', note: 'Pays for time to build the next feature.' },
  ],
  upi: { id: '', qrSrc: '' },           // both empty = UPI card hidden
  story: '',                            // YOUR words, 2-3 sentences. Empty = the default line is used.
};
