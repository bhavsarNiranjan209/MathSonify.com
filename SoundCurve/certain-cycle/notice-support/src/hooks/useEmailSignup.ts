/** React wrapper around createSignup — for React islands. Astro pages can use createSignup directly. */
import { useEffect, useMemo, useState } from 'react';
import { createSignup, type SignupState } from '../lib/signupClient';

export function useEmailSignup(topic: string) {
  const ctl = useMemo(() => createSignup(topic), [topic]);
  const [state, setState] = useState<SignupState>(ctl.state);
  useEffect(() => ctl.subscribe(setState), [ctl]);
  return { state, submit: ctl.submit, check: ctl.check, reset: ctl.reset };
}
