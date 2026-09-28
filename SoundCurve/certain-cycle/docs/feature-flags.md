# Feature Flags

## Overview

SoundCurve uses a centralized feature flag system to control the release of advanced experiences. This document covers how the system works and how to enable features for production launch.

## Current State (Production)

| Feature | Flag | Status |
|---------|------|--------|
| SoundLab | `soundLab` | Hidden |
| Draw | `draw` | Hidden |
| Music Lab | `musicLab` | Hidden |

All three features remain fully implemented but are excluded from public navigation and show a "Coming Soon" page when accessed directly.

## Configuration

Feature flags live in `src/config/featureFlags.ts` — the single source of truth.

### Environment Variables

Each flag can be overridden via environment variables:

| Variable | Flag | Default |
|----------|------|---------|
| `SOUNDLAB_ENABLED` | `soundLab` | `false` |
| `DRAW_ENABLED` | `draw` | `false` |
| `MUSICLAB_ENABLED` | `musicLab` | `false` |

Set to `'true'` to enable in any environment:
```bash
SOUNDLAB_ENABLED=true npm run build
```

### Development

During development (`NODE_ENV=development`), all features are automatically visible for testing. No flags need to be set.

## Release Process

To launch a feature publicly:

1. **Set the flag to `true`** in `src/config/featureFlags.ts` (or set the env var)
2. **Rebuild**: `npm run build`
3. **Deploy** the built site
4. The route and navbar link appear automatically

No additional code changes are required — the navigation and page guards automatically respect the flags.

## Architecture

- **Navigation** (`src/components/Navigation.astro`): Filters links at render time using `isDevelopment()` or `FEATURE_FLAGS`.
- **Route pages** (`soundlab.astro`, `draw.astro`, `music-lab.astro`): Each guards its content with `isRouteDisabled()` and shows `ComingSoon.astro` when disabled.
- **Homepage** (`src/pages/index.astro`): Feature teasers are conditionally rendered with `{FEATURE_FLAGS.xxx && (...)}`.
- **Coming Soon pages** (`src/components/ComingSoon.astro`): Reusable component for the "coming soon" state.

## Code Splitting

Feature implementations (React components, data modules) are only loaded when their route is rendered with the flag enabled. In production, disabled routes render the lightweight ComingSoon component and never load the heavy feature code.
