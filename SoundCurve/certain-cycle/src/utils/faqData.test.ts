/**
 * FAQ data unit tests.
 */
import { faqItems } from '../utils/faqData';

export const test1 = () => {
  // Verify FAQ items array is populated
  if (!Array.isArray(faqItems) || faqItems.length === 0) {
    throw new Error('faqItems should be a non-empty array');
  }
};

export const test2 = () => {
  // Verify each FAQ item has question and answer
  for (const item of faqItems) {
    if (!item.question || !item.answer) {
      throw new Error('Each FAQ item must have question and answer properties');
    }
  }
};

export const test3 = () => {
  // Verify first FAQ item
  const firstItem = faqItems[0];
  if (firstItem.question !== 'How does MathSonify work?') {
    throw new Error('First FAQ item question mismatch');
  }
  if (!firstItem.answer.includes('audio and visual graphs')) {
    throw new Error('First FAQ item answer mismatch');
  }
};