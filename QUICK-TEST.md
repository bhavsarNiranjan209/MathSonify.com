# Quick Animation Test Guide

## Step 1: Check if site loads at all
Open http://localhost:4321

**Expected:** You should see:
- Dark background
- "SoundCurve" navigation at top
- Large text: "Turn Math Into Living Sound & Music"
- Two buttons: "Open Sound Studio" and "Explore Library"

**If you don't see this:** The dev server might not be running properly.

## Step 2: Check Hero animations (CSS-based, should always work)
Look at the badge at the very top that says "MATHEMATICAL ACOUSTIC EXPERIMENT"

**Expected:** It should slowly float up and down (bobbing motion)

**If it's NOT moving:** Your browser might have "Reduce Motion" enabled

## Step 3: Check Studio page
Go to http://localhost:4321/create

**Expected:** You should see:
- A dark interface with controls on the left
- A graph/visualizer on the right
- Equation input field at top left
- Play button

**If elements are invisible or transparent:** The Framer Motion animations didn't complete

## Step 4: Open Browser Console
Press F12, click "Console" tab

**Look for:**
- Any RED error messages
- Messages about "framer-motion"
- Messages about "React"

## Quick Fix Attempts

### Fix 1: Hard Refresh
Press `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)

### Fix 2: Check Reduce Motion
**Windows 11:**
Settings → Accessibility → Visual effects → Animation effects (should be ON)

**Mac:**
System Preferences → Accessibility → Display → Reduce motion (should be OFF)

### Fix 3: Restart Dev Server
```bash
cd C:/Projects(NiJo)/SoundCurve/certain-cycle
npm run dev
```

## What specifically isn't working?

Please tell me:
1. [ ] Homepage loads but nothing animates
2. [ ] Studio page (/create) has invisible/transparent elements
3. [ ] Everything works but animations are instant (no smooth transitions)
4. [ ] Browser console shows errors
5. [ ] Something else (describe):

