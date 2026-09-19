/** Access seam for the future account/subscription provider. */
export function isMusicLabPremium(): boolean {
  // MathSonify currently has no authentication or billing system, so the studio is enabled.
  return true;
}
