# SoundCurve Animations Checklist

## What Should Be Animated

### Homepage (http://localhost:4321)

1. **Hero Section**
   - ✅ Floating badge animation (should bob up and down)
   - ✅ Animated wave background (3 moving sine waves)
   - ✅ Staggered text fade-in (badge → headline → subtitle → buttons → presets)
   - ✅ Gradient text shimmer (color cycling)
   - ✅ Preset chips bounce in with delays
   - ✅ CTA buttons scale on hover

2. **Showcase Cards (scroll down)**
   - ✅ Cards fade + slide up when scrolling into view
   - ✅ Cards lift up slightly on hover
   - ✅ "Hear It →" buttons scale on hover

3. **Feature Cards**
   - ✅ Fade + slide up when scrolling into view
   - ✅ Staggered delays (0s, 0.1s, 0.2s, 0.3s)

### Studio Page (http://localhost:4321/create)

1. **Visualizer Component**
   - ✅ Container fades in and slides up on load
   - ✅ Mode tabs have animated sliding indicator
   - ✅ Tab buttons stagger in with bounce
   - ✅ Grid/Particles toggles slide in when in 2D mode
   - ✅ "Live" badge bounces in when playing
   - ✅ Error messages fade in/out smoothly
   - ✅ Coordinate tooltip fades in on hover

2. **Equation Input**
   - ✅ Input field shakes horizontally on error
   - ✅ Validation message fades in/out with checkmark bounce
   - ✅ Math helper chips stagger in
   - ✅ Preset buttons bounce in with delays
   - ✅ Domain controls accordion smooth expand/collapse

3. **Share Modal**
   - ✅ Backdrop fades in
   - ✅ Modal springs in (scale + slide)
   - ✅ Content staggers (header → preview → URL → social)
   - ✅ Social buttons pop in individually
   - ✅ Copy button pulses when clicked
   - ✅ Close button rotates 90° on hover

## Troubleshooting

### If animations aren't working:

1. **Check Browser Console** (F12)
   - Look for JavaScript errors
   - Look for "framer-motion" errors

2. **Check if React is hydrating**
   - Open http://localhost:4321/create
   - Open DevTools → Console
   - You should NOT see errors about hydration

3. **Verify Framer Motion is loaded**
   - Open DevTools → Network tab
   - Filter for "framer-motion"
   - Should see the module loading

4. **Check CSS animations (non-Framer Motion)**
   - Hero floating badge should work (pure CSS)
   - Wave background should animate (Canvas JS)
   - Scroll animations on homepage should work (Intersection Observer JS)

5. **Hard refresh the browser**
   - Press Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Clears cache and reloads

## Quick Test

Open browser console and run:
```javascript
// Check if React is available
console.log('React:', typeof window.React !== 'undefined' ? 'Loaded' : 'Not loaded');

// Check if components rendered
console.log('Studio container:', document.querySelector('.min-h-screen.pt-20') ? 'Found' : 'Not found');

// Check computed styles
const visualizer = document.querySelector('.rounded-sc-lg.overflow-hidden');
if (visualizer) {
  console.log('Visualizer opacity:', window.getComputedStyle(visualizer).opacity);
  console.log('Visualizer transform:', window.getComputedStyle(visualizer).transform);
}
```

## Expected Behavior

- **Homepage**: Smooth staggered animations on load, scroll-triggered animations
- **Studio page**: All elements should be visible (opacity: 1) after load
- **Interactions**: Hover effects, button clicks, modal opens should all animate smoothly
- **No flickering**: Components should transition smoothly, not snap

## If Still Not Working

Tell me:
1. Which page(s) you're looking at
2. What specific animation isn't working
3. Any console errors
4. Browser you're using (Chrome, Firefox, etc.)
