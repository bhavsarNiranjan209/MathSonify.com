/**
 * support.ts — everything the /support page needs. Prices are in US dollars (international supporters).
 * Any EMPTY value hides that element, so there is never a dead button. Fill these in when you pick a platform.
 */
import { MIN_USD, MAX_USD } from '../lib/supportAmount';

export const SUPPORT = {
  currency: 'USD' as const,
  min: MIN_USD,                           // $5
  max: MAX_USD,                           // $1,000,000
  // Your donation link. {amount} is replaced with the dollars when the platform supports it in the URL.
  // Empty = the pay button is hidden. Check: does your platform accept CUSTOM amounts up to your max?
  donateUrl: '',                          // e.g. 'https://your-platform.example/you?amount={amount}'
  tiers: [                                // the three named sizes (chai, coffee, long night)
    { emoji: '🍵', name: 'A chai', amount: 5, note: 'Covers a day of hosting.' },
    { emoji: '☕', name: 'A coffee', amount: 10, note: 'Keeps the domain and email running.', popular: true },
    { emoji: '🥪', name: 'A long night', amount: 15, note: 'Pays for time to build the next feature.' },
  ],
  quickAmounts: [5, 10, 50, 200, 500],    // one-tap chips; supporters can also type any amount
  // Labels only — the page cannot add methods your platform does not offer.
  // UPI and net banking only work for people paying FROM India, so they are not listed for international supporters.
  methods: ['Visa', 'Mastercard', 'American Express', 'Apple Pay', 'Google Pay', 'PayPal'],
  story: '',                              // YOUR words, 2-3 sentences. Empty = the default line is used.
};
