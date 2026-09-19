# SoundCurve — Agent Guidelines

## Project Overview
SoundCurve is an interactive web app that transforms mathematical equations into audio and visual graphs. Users can explore equations from famous scientists, edit them in a studio, and export visualizations as images/videos.

## Tech Stack
- **Framework**: Astro 5.x with React integration
- **Styling**: Tailwind CSS v4
- **State**: Zustand (`src/store/studioStore.ts`)
- **Math Parsing**: math.js
- **Audio**: Web Audio API (`src/utils/audioEngine.ts`)
- **Export**: Canvas API for images, MediaRecorder for video

## File Organization
```
src/
├── components/       # React UI components (Studio.tsx, Visualizer.tsx, etc.)
├── data/             # Static data (scientists.ts, presets.ts)
├── i18n/             # Translations (en, es, fr, de, etc.)
├── layouts/          # Astro layouts (BaseLayout.astro)
├── pages/            # Route pages (index, equations, scientists, create, etc.)
├── store/            # Zustand state management
└── utils/            # Core logic (audio, export, equation parsing)
```

## Key Files
| File | Purpose |
|------|---------|
| `src/components/Studio.tsx` | Main equation editor and graph visualization |
| `src/components/Visualizer.tsx` | Canvas-based graph rendering |
| `src/data/scientists.ts` | Scientist profiles and their equations |
| `src/data/presets.ts` | Pre-defined equation templates |
| `src/utils/equationParser.ts` | Math expression parsing and evaluation |
| `src/utils/audioEngine.ts` | Web Audio API sound synthesis |
| `src/utils/videoExporter.ts` | Video recording and export |
| `src/utils/watermark.ts` | Watermark overlay for exports |

## Development Guidelines

### Running Dev Server
```bash
astro dev --background    # Start dev server
astro dev stop            # Stop dev server
astro dev status          # Check server status
astro dev logs            # View server logs
```

### Code Conventions
- Components use `.tsx` extension with React
- Pages use `.astro` extension
- Utilities are plain `.ts` files
- Tailwind classes for styling (no CSS modules)
- Zustand for state (avoid prop drilling)

### Key Features to Understand
1. **Equation Input**: Math symbol pad + text input with live preview
2. **Graph Visualization**: Canvas-based rendering with zoom/pan
3. **Audio Synthesis**: Equation-to-sound conversion via Web Audio API
4. **Export**: Image (PNG), Video (WebM), share links
5. **Scientist Profiles**: Browse equations by historical scientists

### Common Tasks
- **Adding equations**: Edit `src/data/presets.ts` or `src/data/scientists.ts`
- **New components**: Create in `src/components/`, follow existing patterns
- **Translations**: Add to `src/i18n/translations/[lang].ts`
- **Export issues**: Check `src/utils/videoExporter.ts` and `src/utils/watermark.ts`

### Responsive Design
- Mobile-first approach with Tailwind breakpoints
- Key breakpoints: `sm:640px`, `md:768px`, `lg:1024px`
- Touch-friendly controls for mobile equation editing

### Performance Notes
- Canvas rendering is requestAnimationFrame-based
- Audio synthesis runs in Web Audio API worklet
- Heavy computations should be debounced

## Do's and Don'ts
### Do
- Use Zustand store for shared state
- Keep components focused and small
- Test equation parsing edge cases
- Follow existing file naming patterns

### Don't
- Don't use `display: none` for canvas elements (breaks rendering)
- Don't block the main thread with heavy math computations
- Don't hardcode equation strings in components
- Don't add new dependencies without checking bundle size impact
