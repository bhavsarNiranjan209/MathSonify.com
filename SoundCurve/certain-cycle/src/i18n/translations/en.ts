const en = {
  // Navigation
  'nav.scientists': 'Scientists',
  'nav.explore': 'Explore',
  'nav.studio': 'Studio',
  'nav.soundlab': 'SoundLab',
  'nav.musicLab': 'Music Lab',
  'nav.draw': 'Draw',
  'nav.guess': 'Guess',
  'nav.howItWorks': 'How It Works',
  'nav.equations': 'Equations',
  'nav.about': 'About',
  'nav.support': 'Support',
  'nav.displayMode': 'Display mode',
  'nav.analog': 'Analog',
  'nav.light': 'Light',
  'nav.dark': 'Dark',
  'nav.language': 'Language',

  // Hero
  'hero.tagline': 'mathematical acoustics',
  'hero.titleLine1': 'Turn mathematics into',
  'hero.titleAccent': 'living',
  'hero.titleLine2': 'sound',
  'hero.subtitle': 'Type an equation. Read its geometry from the paper, press play, and hear its harmonics synthesized through the Web Audio API in real time.',
  'hero.ctaStudio': 'Open Studio',
  'hero.ctaLibrary': 'Browse the library',
  'hero.curveLabel': 'sampled at 800 points',
  'hero.quickExperiments': 'quick experiments — click to open in the Studio',

  // Home — Showcase
  'home.showcaseTag': 'curated sonifications',
  'home.showcaseTitle': 'Every formula has its own distinct timbre',
  'home.showcaseSubtitle': 'Explore iconic mathematical relationships and hear how changes in geometry translate into intervals and timbral brightness.',
  'home.hearIt': 'Hear it',
  'home.browseLibrary': 'Browse the full library',

  // Home — Features
  'home.featuresTag': 'engineered for accuracy',
  'home.featuresTitle': 'A deterministic math-to-sound pipeline',
  'home.feature1Title': 'Safe math parsing',
  'home.feature1Desc': 'Zero eval(). Every equation is parsed into an abstract syntax tree via mathjs.',
  'home.feature2Title': 'Six synth voices',
  'home.feature2Desc': 'From pure sine and triangle to analog saw, 8-bit square, resonant piano body, and plucked-string synthesis.',
  'home.feature3Title': 'Four sonification modes',
  'home.feature3Desc': 'Microtonal pitch sweeps, scale quantization, rhythmic peak triggers, and chord voicings.',
  'home.feature4Title': 'Client-side WAV export',
  'home.feature4Desc': 'Render any composition to uncompressed 16-bit 44.1kHz stereo without a server.',

  // Home — Callout
  'home.calloutQuote': '"Wait... you can actually hear the geometry of mathematics?"',
  'home.calloutDesc': 'MathSonify turns abstract equations into an intuitive sensory experience for students, musicians, educators, and creative coders.',
  'home.calloutCta': 'Start creating in the Studio',

  // Studio
  'studio.subtitle': 'Type any mathematical expression, read its geometry from the paper, and press play to synthesize its acoustic resonance.',
  'studio.interactiveLabel': 'interactive audio synthesizer',
  'studio.version': 'Studio v1.0',
  'studio.spaceHint': 'play or stop',
  'studio.equationOfTheDay': 'Equation of the day',
  'studio.howMathTitle': 'How math creates sound:',
  'studio.howMathDesc': 'as the playhead scans along x, the vertical elevation y(x) controls oscillator frequency while the slope dy/dx modulates filter brightness and timbre.',
  'studio.undo': 'Undo',
  'studio.redo': 'Redo',
  'studio.cannotUndo': 'No undo available',
  'studio.cannotRedo': 'No redo available',
  'studio.pasteEquation': 'Paste equation',
  'studio.useEquationBar': 'Back to equation bar',
  'studio.pasteHint': 'Paste an equation from a book, a website or LaTeX — we clean it up and graph it.',
  'studio.pasteParamsNote': 'Parameters in your equation (like a or k) are set to 1 when applied — edit the number in the equation to change them.',
  'studio.use': 'Use',
  'studio.clear': 'Clear',

  // Guess — the listening game
  'guess.round': 'Round',
  'guess.score': 'Score',
  'guess.streak': 'Streak',
  'guess.listenTitle': 'Listen to the curve.',
  'guess.listenHint': 'One of these four equations was played. Pick the one you heard.',
  'guess.wasIt': 'Here is what it sounded like.',
  'guess.revealHint': 'The curve is drawn now, and the options are locked.',
  'guess.play': 'Play the equation',
  'guess.playing': 'Playing…',
  'guess.played': 'Played',
  'guess.correct': 'correct',
  'guess.yourAnswer': 'your answer',
  'guess.feedbackCorrect': 'That is exactly what you heard.',
  'guess.feedbackWrong': 'Not this time — this is the one you heard.',
  'guess.next': 'Next round',
  'guess.seeResults': 'See results',
  'guess.finalLabel': 'Final score',
  'guess.finalPerfect': 'A perfect score. You are listening to mathematics.',
  'guess.finalGood': 'Well heard. The curves are getting familiar.',
  'guess.finalKeepGoing': 'Good first pass. Play again and start recognising the families.',
  'guess.progressLabel': 'Round progress',
  'guess.stop': 'Stop',
  'guess.fb.correct1': 'Exactly right. That is the sound of this curve.',
  'guess.fb.correct2': 'You caught it — the shape was right in your ear.',
  'guess.fb.correct3': 'Clean call. This family is becoming familiar.',
  'guess.fb.correct4': 'Yes. You heard the structure, not just the notes.',
  'guess.fb.correct5': 'Spot on. That one was yours.',
  'guess.fb.near1': 'So close — that was a sibling curve. Almost the same sound.',
  'guess.fb.near2': 'A near miss. These two live in the same family, so the difference is subtle.',
  'guess.fb.near3': 'Right neighbourhood, wrong door. Listen for how the two differ.',
  'guess.fb.near4': 'Nearly. You were in the right family — the detail is where it turned.',
  'guess.fb.near5': 'So close that it is worth replaying. Compare the two curves below.',
  'guess.fb.miss1': 'Not this time. The curve is revealed — see where your guess diverged.',
  'guess.fb.miss2': 'That one evaded you. Have a look at its shape now.',
  'guess.fb.miss3': 'A genuine miss. This family sounds quite different from your guess.',
  'guess.fb.miss4': 'Not that one. Now you can see why they sounded unrelated.',
  'guess.fb.miss5': 'Missed. The revealed curve shows the family you were looking for.',
  'guess.grade.legend': 'Legend. Ten out of ten — you are hearing mathematics.',
  'guess.grade.great': 'Great run. The families are becoming second nature.',
  'guess.grade.learning': 'Good progress. The near-miss rounds are where the learning is.',
  'guess.grade.beginning': 'A solid start. Play again and let the families separate in your ear.',
  'guess.playAgain': 'Play again',
  'guess.preGame.tag': 'Normal play',
  'guess.preGame.title': 'Pick a difficulty',
  'guess.preGame.subtitle': 'Choose a tier, or play the full 30-equation library.',
  'guess.difficulty.tag': 'Difficulty',
  'guess.difficulty.subtitle': 'Easy fundamentals, Medium interference and percussion, or Hard sweeps, decays and windowed shapes.',
  'guess.difficulty.all': 'All 30',
  // Daily challenge card — sits beside normal play on /guess
  'guess.daily.tag': 'Daily challenge',
  'guess.daily.title': 'Daily challenge',
  'guess.daily.subtitle': 'One worldwide game per day, on the US Eastern clock. Same questions for everyone.',
  'guess.daily.playToday': 'Play today',
  'guess.daily.playedToday': 'Played today',
  'guess.daily.streak': 'Streak',
  'guess.daily.nextIn': 'Next challenge in',
  'guess.daily.finishTag': 'Daily result',
  'guess.daily.finishDate': 'Daily ·',
  'guess.daily.finishStripLabel': 'Answer strip',
  'guess.daily.share': 'Share result',
  'guess.daily.copied': 'Copied',
  // End-game tiers. Grade and message per band, ported from the reference.
  // The low band is deliberately encouraging — it must never read as punishment.
  'guess.tier.perfect.grade': 'Perfect pitch?! 🏆',
  'guess.tier.perfect.msg': 'Every single one, right on the first try.',
  'guess.tier.mid.grade': 'Good ear. 🎧',
  'guess.tier.mid.msg': 'You caught the clear ones — the close pairs take practice.',
  'guess.tier.low.grade': 'Keep training.',
  'guess.tier.low.msg':
    'The hard pairs are hard on purpose — try again, your ear adjusts fast.',

  // AudioControls
  'audio.play': 'Play audio',
  'audio.stop': 'Stop',
  'audio.exportWav': 'Export WAV',
  'audio.share': 'Share',
  'audio.support': 'Support',
  'audio.supportTooltip': 'Support MathSonify — keep the music playing',
  'audio.chooseInstrument': 'Choose an instrument',
  'audio.howMathMakesSound': 'How the math makes sound',
  'audio.musicalScale': 'Musical scale quantization',
  'audio.tuned': 'tuned',
  'audio.volume': 'Volume',
  'audio.duration': 'Duration',
  'audio.speed': 'Speed',
  'audio.loopPlayback': 'Loop playback',
  'audio.continuousCycle': 'Continuous mathematical cycle',
  'audio.frequencyBounds': 'Frequency bounds',
  'audio.lowPitch': 'Low pitch',
  'audio.highPitch': 'High pitch',
  'audio.spaceStartsStops': 'starts and stops the sound',
  'audio.pendingTitle': 'New sound ready — press refresh',
  'audio.pendingDesc': 'Your loop is still playing the previous sound. Hit the refresh twist button next to Stop to hear your pick.',
  'audio.apply': 'Apply',
  'audio.refreshTooltip': 'Refresh playback',
  'audio.applyTooltip': 'Refresh to apply changes',
  'audio.exportTooltip': 'Export as WAV audio file',
  'audio.shareTooltip': 'Share this equation',

  // SoundLab workspace
  'soundlab.skipToPlayer': 'Skip to selected composition',
  'soundlab.eyebrow': 'Hear what math can become',
  'soundlab.subtitle': 'Fifteen original systems of equations, each shaped into a composition for listening.',
  'soundlab.compositions': 'Compositions',
  'soundlab.earlyAccess': 'Early Access',
  'soundlab.soundlabLabel': 'SoundLab',
  'soundlab.previewLabel': 'Preview',
  'soundlab.earlyAccessLimited': 'Early Access ·',
  'soundlab.compositionsAvailableToday': 'compositions available today.',
  'soundlab.previewNotice': 'SoundLab is in preview. Playback access opens soon.',
  'soundlab.nowSelected': 'Now selected',
  'soundlab.library': 'SoundLab Library',
  'soundlab.searchPlaceholder': 'Search compositions…',
  'soundlab.searchLabel': 'Search compositions by title, genre, equation, or instrument',
  'soundlab.categories': 'SoundLab categories',
  'soundlab.all': 'All',
  'soundlab.noResults': 'No compositions found.',
  'soundlab.clearFilters': 'Clear filters',
  'soundlab.selectedTrack': 'Selected Track',
  'soundlab.type': 'Type',
  'soundlab.instrument': 'Instrument',
  'soundlab.viewEquation': 'View equation details',
  'soundlab.equationNote': 'Original MathSonify composition layer. Playback is for listening; the equation is not licensed for reuse.',
  'soundlab.compositionInfo': 'Composition Info',
  'soundlab.composition': 'Composition',
  'soundlab.genre': 'Genre',
  'soundlab.bpm': 'BPM',
  'soundlab.scale': 'Scale',
  'soundlab.duration': 'Duration',
  'soundlab.seconds': 'seconds',
  'soundlab.tracks': 'Tracks',
  'soundlab.status': 'Status',
  'soundlab.proprietary': 'Proprietary',
  'soundlab.rights': 'Playback for listening; equations not licensed for reuse.',
  'soundlab.beyondListening': 'Beyond listening',
  'soundlab.createOwn': 'Create your own',
  'soundlab.createOwnDesc': 'Take mathematics beyond listening.',
  'soundlab.openMusicLab': 'Open Music Lab →',
  'soundlab.closeLibrary': 'Close compositions',

  // Instrument labels
  'inst.sine': 'Sine',
  'inst.sineDesc': 'Pure harmonic tone',
  'inst.triangle': 'Triangle',
  'inst.triangleDesc': 'Warm flute/organ',
  'inst.sawtooth': 'Saw',
  'inst.sawtoothDesc': 'Bright analog brass',
  'inst.square': 'Square',
  'inst.squareDesc': '8-bit retro pulse',
  'inst.piano': 'Piano',
  'inst.pianoDesc': 'Acoustic piano body',
  'inst.pluck': 'Pluck',
  'inst.pluckDesc': 'Harp / guitar string',

  // Mode labels
  'mode.frequency': 'Continuous',
  'mode.frequencyDesc': 'Continuous pitch curve',
  'mode.note': 'Scale notes',
  'mode.noteDesc': 'Quantized musical scale',
  'mode.rhythm': 'Rhythm',
  'mode.rhythmDesc': 'Mathematical peak strikes',
  'mode.chord': 'Chords',
  'mode.chordDesc': 'Harmonic polyphony',

  // EquationInput
  'eq.mathEquation': 'Mathematical equation',
  'eq.surpriseMe': 'Surprise me',
  'eq.library': 'Library',
  'eq.placeholder': 'Type an equation — e.g. sin(x) * cos(3*x)',
  /*
   * Replaces the old "View all 12+" control. That opened the preset library,
   * which was redundant with the separate Library button already doing exactly
   * that. This now opens the math symbol keyboard instead — the control is
   * beside "Popular presets", where a "more symbols" affordance belongs.
   *
   * English only for now: the other locales fall back to this string until they
   * are translated. Translating 19 languages by guesswork would be worse than an
   * honest English fallback.
   */
  'eq.moreSymbols': 'More symbols',
  'eq.validExpression': 'Valid mathematical expression',
  'eq.insertFunction': 'Insert function',
  'eq.popularPresets': 'Popular presets',
  'eq.viewAll': 'View all 12+',
  'eq.domainRange': 'Domain and sampling range',
  'eq.hide': 'hide',
  'eq.expand': 'expand',
  'eq.minX': 'Min X (start)',
  'eq.maxX': 'Max X (end)',

  // Explore page
  'explore.tag': 'library of acoustic geometry',
  'explore.title': 'Explore equations',
  'explore.subtitle': 'Discover how different mathematical functions, from harmonic trig waves to chaotic damped oscillators, translate into distinct musical timbres.',
  'explore.sonicProfile': 'Sonic profile:',
  'explore.domain': 'Domain:',
  'explore.playInStudio': 'Play in Studio',

  // How It Works page
  'howItWorks.tag': 'architectural specification',
  'howItWorks.title': 'How math becomes music',
  'howItWorks.subtitle': 'MathSonify is not a random sound generator. It implements a deterministic mathematical translation engine that converts geometric properties of equations into acoustic properties of sound.',
  'howItWorks.step1Title': 'Safe AST equation parsing',
  'howItWorks.step1Desc': 'When you enter a formula like sin(x) * cos(3*x), MathSonify uses mathjs to compile it into an abstract syntax tree (AST). We never execute raw eval(), ensuring complete client-side security and eliminating code injection risks.',
  'howItWorks.step1Code': 'Input string, tokenizer, AST expression tree, compiled function',
  'howItWorks.step2Title': 'High-resolution sampling and derivative estimation',
  'howItWorks.step2Desc': 'The compiled equation is sampled across your chosen domain [x_min, x_max] at 600–800 discrete points. For each point we compute the coordinate (x, y), estimate the first derivative (slope dy/dx), and compute local curvature:',
  'howItWorks.step2Code': 'slope(x) = [f(x + dx) - f(x - dx)] / 2dx',
  'howItWorks.step3Title': 'Acoustic parameter mapping',
  'howItWorks.step3Desc': 'Mathematical dimensions are mapped to audio physics:',
  'howItWorks.step3x': 'Horizontal coordinate (x): mapped directly to the audio timeline and clock progress.',
  'howItWorks.step3y': 'Vertical elevation (y): normalized to audio pitch or quantized to musical scale degrees (e.g. minor pentatonic).',
  'howItWorks.step3dy': 'Curve slope (|dy/dx|): dynamically opens the biquad lowpass filter cutoff to introduce higher harmonic brightness during steep transitions.',
  'howItWorks.step4Title': 'Real-time Web Audio API synthesis',
  'howItWorks.step4Desc': 'We construct custom audio routing graphs inside the browser using native AudioContext:',
  'howItWorks.step4Note': 'A master DynamicsCompressorNode ensures zero audio clipping, guarding your ears against sudden mathematical spikes or asymptotes.',
  'howItWorks.step5Title': 'Audio-visual synchronized playback',
  'howItWorks.step5Desc': 'As the audio context synthesizes the waveform, a 60 FPS animation loop drives the canvas 2D engine. The playhead traces the exact mathematical point on screen while the curve and spectrum state respond to the sound output.',
  'howItWorks.cta': 'Try it in the Studio',
  // How It Works page — rebuilt experience copy (the step1–5 keys above
  // describe the old technical page and no longer match the live text)
  'howItWorks.heroTag': 'Try it yourself',
  'howItWorks.heroSub':
    'Not by describing it. Type an equation, watch it become a curve, and hear that curve played. The scanner walks from left to right, and every point it passes becomes a note.',
  'howItWorks.asideCurve': 'A curve',
  'howItWorks.asideJourney': 'A journey',
  'howItWorks.asideSound': 'A sound',
  'howItWorks.journeyTitle': 'The same journey, every time',
  'howItWorks.journeySub':
    'Everything above is one transformation, whether the equation is <code class="font-mono text-sc-text">sin(x)</code> or something far less forgiving.',
  'howItWorks.journey1Title': 'Mathematics',
  'howItWorks.journey1Desc': 'You write an equation. It is parsed into a tree and never executed as code.',
  'howItWorks.journey2Title': 'Geometry',
  'howItWorks.journey2Desc': 'The curve is sampled into points, each carrying its height, slope and curvature.',
  'howItWorks.journey3Title': 'Motion',
  'howItWorks.journey3Desc': 'A playhead sweeps left to right. Position in x becomes position in time.',
  'howItWorks.journey4Title': 'Sound',
  'howItWorks.journey4Desc': 'Height becomes pitch, steepness opens the filter, and the curve is heard.',
  'howItWorks.journey5Title': 'Music',
  'howItWorks.journey5Desc': 'Snapped to a scale, the same mathematics becomes something you might replay.',
  'howItWorks.exploreTag': 'Explore',
  'howItWorks.exploreTitle': 'Continue the journey',
  'howItWorks.exploreSub':
    'Try a challenge, explore more equations, or learn from the scientists who laid the foundations. Same transformation, different perspectives.',
  'howItWorks.exploreCap1': 'One idea',
  'howItWorks.exploreCap2': 'Many perspectives',
  'howItWorks.cardGuessTitle': 'Guess',
  'howItWorks.cardGuessDesc': 'Listen to the sound and guess the equation behind it.',
  'howItWorks.cardEquationsTitle': 'Equations',
  'howItWorks.cardEquationsDesc': 'Explore a growing library of equations and see how each one sounds.',
  'howItWorks.cardScientistsTitle': 'Scientists',
  'howItWorks.cardScientistsDesc': 'Learn about the mathematicians and scientists behind these ideas.',
  'howItWorks.openStudio': 'Open the Studio',

  // Equations page
  'equations.tag': 'mathematical catalog',
  'equations.title': 'Equation acoustic reference',
  'equations.subtitle': 'A reference guide explaining the mathematical properties and sonic characteristics of supported functions.',
  'equations.openInStudio': 'Open in Studio',

  // About page
  'about.tag': 'about this project',
  'about.title': 'About MathSonify',
  'about.subtitle': 'Building intuitive, creative, and musical bridges into the abstract beauty of mathematics.',
  'about.missionTitle': 'Our mission',
  'about.missionDesc1': 'Mathematics is often taught as static equations on chalkboard grids. But physical sound itself is mathematics in motion: periodic waveforms, harmonic overtone series, differential equations of resonance, and Fourier decompositions.',
  'about.missionDesc2': 'MathSonify was created to make mathematics tangible, emotional, and creative. Whether you are a student learning trigonometry, a music producer designing unique timbre palettes, or a creative coder exploring algorithmic beauty, MathSonify lets you hear what numbers look like.',
  'about.builderTitle': 'Who builds MathSonify',
  'about.builderDesc': 'MathSonify is designed, built, and maintained by a small, dedicated team. It began with a simple question — what does an equation actually sound like? — and it is still shaped by the people who use it.',
  'about.underHood': 'Under the hood',
  'about.techTitle': 'Technical architecture',
  'about.techDesc': 'MathSonify is architected to be 100% serverless, private, and zero-cost to maintain:',
  'about.techAstro': 'Astro + React hybrid: fast static delivery for marketing and educational pages, with an isolated, reactive Zustand-driven React island for the Studio.',
  'about.techParser': 'Secure math parser: powered by mathjs AST parsing. No insecure JavaScript eval() is ever executed.',
  'about.techAudio': 'Native Web Audio API: 100% browser-native real-time polyphonic and microtonal synthesis with custom DSP envelopes, biquad filters, and anti-clipping compressors.',
  'about.techExport': 'Client-side WAV exporter: real-time and offline audio buffer rendering converting formulas into standard 16-bit 44.1kHz audio files.',
  'about.privacyTitle': 'Privacy and open access',
  'about.privacyDesc': 'MathSonify requires no user account, no login, and no subscription for its core functionality. Your equations are processed directly on your device\'s CPU and never transmitted to external analytics or database servers.',
  'about.cta': 'Open Studio',

  // Footer
  // Scientists page
  'scientists.tag': 'hear the masters',
  'scientists.title': 'Famous Scientists & Mathematicians',
  'scientists.subtitle': "Explore the minds behind history's greatest equations and listen to their mathematical legacies translated into sound.",
  'scientists.equations': 'equations',
  'scientists.viewEquations': 'View Equations',
  'scientists.playInStudio': 'Play in Studio',
  'scientists.close': 'Close',
  'scientists.biography': 'Biography',
  'scientists.famousEquations': 'Famous Equations',

  // Footer
  'footer.scientists': 'Famous Scientists',

  'footer.brandDesc': 'An interactive mathematical audio experiment and creative sonification platform — turn math into music.',
  'footer.zeroBackend': 'zero backend · 100% Web Audio API',
  'footer.product': 'Product',
  'footer.creationStudio': 'Studio',
  'footer.equationLibrary': 'Equation Library',
  'footer.howItWorks': 'How It Works',
  'footer.equationGuide': 'Equation Guide',
  'footer.architecture': 'Architecture',
  'footer.about': 'About',
  'footer.aboutMathSonify': 'About MathSonify',
  'footer.support': 'Support MathSonify',
  'footer.freeAccess': 'Free and open access',
  'footer.copyright': '© 2026 MathSonify. All mathematical expressions sonified deterministically.',
  'footer.openStudio': 'Open Studio',

  // Export Modal
  'export.title': 'Export audio file',
  'export.equation': 'Equation:',
  'export.audioFormat': 'Audio format:',
  'export.formatValue': 'WAV (16-bit PCM, 44.1kHz stereo)',
  'export.duration': 'Duration:',
  'export.seconds': 'seconds',
  'export.synthesisVoice': 'Synthesis voice:',
  'export.estimatedSize': 'Estimated size:',
  'export.rendering': 'Rendering audio offline...',
  'export.downloaded': 'Downloaded! Click to render again',
  'export.renderDownload': 'Render and download WAV',
  'export.clientSide': '100% client-side Web Audio processing',
  'export.close': 'Close',

  // Export Modal — image export
  'export.audioTab': 'Audio (WAV)',
  'export.imageTab': 'Image (PNG)',
  'export.imageFormat': 'Image format:',
  'export.watermark': 'Include MathSonify watermark',
  'export.imageDownload': 'Render and download image',
  'export.imageRendering': 'Rendering image...',
  'export.imageDownloaded': 'Downloaded! Click to render again',
  'export.resolution2x': '2× retina',
  'export.videoRendering': 'Rendering video…',
  'export.videoReady': 'Video ready — review and save',
  'export.videoDownloaded': 'Downloaded! Click to render again',
  'export.videoDownload': 'Render and download video',

  // Preset Drawer
  'preset.title': 'Equation library',
  'preset.subtitle': 'Choose a mathematical curve to explore its soundscape',
  'preset.searchPlaceholder': 'Search equations, formulas, sounds...',
  'preset.load': 'Load',
  'preset.emptyState': 'No equations found matching',
  'preset.clickToLoad': 'Click any equation to load it into the Studio',
  'preset.close': 'Close',

  // Coming Soon pages
  'comingSoon.soundlab.title': 'SoundLab',
  'comingSoon.soundlab.subtitle': 'A proprietary multi-track equation composition studio — coming soon.',
  'comingSoon.draw.title': 'Draw',
  'comingSoon.draw.subtitle': 'A sketch-to-music experience — coming soon.',
  'comingSoon.musiclab.title': 'Music Lab',
  'comingSoon.musiclab.subtitle': 'A mathematical instrument creation studio — coming soon.',
  'comingSoon.backToHome': 'Back to MathSonify',

  // Support page (the page itself renders English today, like pricing; these keys are the translation source)
  'support.badge': 'support',
  'support.title': 'Help keep the music playing',
  // Same title with the <em> the hero renders — data-i18n-html replaces
  // innerHTML, so the plain support.title cannot carry the emphasis.
  'support.titleHtml': 'Help keep the <em>music</em> playing',
  'support.titleEm': 'music',
  'support.lead': 'MathSonify started with one question: what does an equation sound like? Everything here is free. If it changed how you hear maths, a coffee keeps it that way.',
  'support.chooseSize': 'Choose a size',
  'support.orCustom': 'or choose your own amount',
  'support.quickAmounts': 'Quick amounts',
  'support.amountLabel': 'Amount in US dollars',
  'support.amountPlaceholder': 'Any amount',
  'support.yourSupport': 'Your support',
  'support.payCta': 'Continue to secure payment',
  'support.payCtaShort': 'Continue to payment',
  'support.paymentSoon': 'Secure payment opens soon — we’re connecting a donation platform that accepts custom amounts and international cards. Pick an amount above and it will be ready when you are.',
  'support.secureNote': 'Payment is handled by our payment partner — we never see your card or bank details.',
  'support.whereTitle': 'Where it goes',
  'support.whereSub': 'No ads, no tracking, no paywall on the core experience. Support goes to three honest things:',
  'support.domain': 'The domain',
  'support.domainDesc': 'mathsonify.com renews every year.',
  'support.hosting': 'Hosting and email',
  'support.hostingDesc': 'The servers, and the service that tells you when SoundLab and Music Lab open.',
  'support.time': 'Time to build',
  'support.timeDesc': 'New equations, new instruments and fixes — shaped by what people ask for.',
  'support.promise': 'Support does not unlock anything. Donations are voluntary gifts, not purchases. Everything you can use today stays free.',
  // Same promise with the <b> the page renders on its first sentence.
  'support.promiseHtml':
    '<b class="text-sc-text">Support does not unlock anything.</b> Donations are voluntary gifts, not purchases. Everything you can use today stays free.',
  'support.freeTitle': 'Can’t donate? These help just as much',
  'support.freeSub': 'Honestly, they might help more.',
  'support.share': 'Share MathSonify',
  'support.suggest': 'Suggest an equation',
  'support.challenge': 'Challenge a friend in Guess',
  'support.smallPrint': 'Support is voluntary and does not unlock features. Payment is processed by a third party whose privacy policy applies there.',
  'support.enterAmount': 'Enter an amount, or pick one above.',
  'support.generous': 'Thank you — that is generous. Large gifts may need extra verification from your payment provider.',
  'support.pickFirst': 'Pick an amount first.',
  'support.linkCopied': 'Link copied',

  // Equations reference (data)
  'eqref.periodicTitle': 'Periodic trigonometric functions',
  'eqref.periodicDesc': 'Fundamental cyclical oscillations that form the building blocks of acoustic waveforms and Fourier analysis.',
  'eqref.polyTitle': 'Polynomial and algebraic curves',
  'eqref.polyDesc': 'Curves exhibiting acceleration, inflection points, and asymptotic growth.',
  'eqref.expTitle': 'Exponential, gaussian and damped systems',
  'eqref.expDesc': 'Physical models of real-world energy dissipation, probability, and resonance.',

  // Privacy Policy page (rich-text keys carry the same inline HTML as the
  // page; translators preserve the tags and translate only the text.
  // localStorage key names, email addresses and the brand stay in English.)
  'privacy.badge': 'privacy-first architecture',
  'privacy.title': 'Privacy Policy',
  'privacy.intro':
    "MathSonify is built on a radical premise: a creative tool doesn't need to know who you are. This policy explains how that works.",
  'privacy.effective': 'Effective date: September 14, 2026 · Version 1.0',
  'privacy.s1Title': 'Our privacy philosophy',
  'privacy.s1Desc1':
    'MathSonify was designed from the ground up as a <strong class="text-sc-text">zero-data application</strong>. We don\'t just minimize data collection — we eliminated it entirely. There are no servers processing your equations, no databases storing your patterns, and no analytics pipelines watching your interactions. When you close your browser, nothing about your session exists anywhere except on your own device.',
  'privacy.s1Desc2':
    'This isn\'t a policy choice — it\'s an architectural one. MathSonify runs 100% client-side using the Web Audio API, native Canvas 2D rendering, and a sandboxed mathjs expression parser. The math happens on your CPU. The sound happens through your speakers. Nothing leaves your machine.',
  'privacy.s2Title': 'What we do not collect',
  'privacy.s2Intro':
    'To be explicit about what MathSonify does <em class="text-sc-text">not</em> gather, store, transmit, or monetize:',
  'privacy.s2Item1':
    '<strong class="text-sc-text">No accounts or authentication.</strong> There is no sign-up, no login, no password, no email address stored anywhere.',
  'privacy.s2Item2':
    '<strong class="text-sc-text">No analytics or tracking.</strong> We do not use Google Analytics, Mixpanel, Segment, Hotjar, or any third-party telemetry service.',
  'privacy.s2Item3':
    '<strong class="text-sc-text">No cookies.</strong> MathSonify sets no first-party or third-party cookies. Period.',
  'privacy.s2Item4':
    '<strong class="text-sc-text">No equation or usage data.</strong> The equations you type, the audio you generate, and the visualizations you create never leave your browser.',
  'privacy.s2Item5':
    '<strong class="text-sc-text">No advertising or profiling.</strong> We do not serve ads, build user profiles, or sell data to third parties.',
  'privacy.s2Item6':
    '<strong class="text-sc-text">No IP logging.</strong> Our hosting infrastructure does not log or retain visitor IP addresses beyond what is required for ephemeral request serving.',
  'privacy.s3Title': 'Local browser storage',
  'privacy.s3Intro':
    'MathSonify uses your browser\'s <code class="px-1.5 py-0.5 rounded bg-sc-sunken text-sc-accent font-mono text-xs border border-sc-line/15">localStorage</code> API to persist a few preferences and your Guess daily-challenge progress on your device:',
  'privacy.s3Note1':
    'Remembers whether you prefer light or dark display mode. Value: <code class="text-sc-accent">"light"</code> or <code class="text-sc-accent">"dark"</code>.',
  'privacy.s3Note2':
    'Remembers your selected interface language. Value: a language code (e.g. <code class="text-sc-accent">"en-US"</code>, <code class="text-sc-accent">"es"</code>).',
  'privacy.s3Note3':
    'Remembers your last export choices: orientation and quality for image and video exports (landscape/portrait, 480p/720p/1080p) and the curve color (white/blue/green/purple). Value: a small JSON object.',
  'privacy.s3Note4':
    'The date of your last scored Guess daily challenge. Value: a <code class="text-sc-accent">"YYYY-MM-DD"</code> string on the US Eastern calendar.',
  'privacy.s3Note5':
    'Your per-question results for today\'s daily challenge. Value: an array of booleans.',
  'privacy.s3Note6':
    'Your current consecutive-day streak for the Guess daily challenge. Value: a number.',
  'privacy.s3Outro':
    'This data is stored exclusively in your browser. It is never transmitted to any server, shared with any service, or accessible to any other website. You can clear it at any time through your browser settings — MathSonify will simply ask for your preferences again on the next visit.',
  'privacy.s4Title': 'Third-party dependencies',
  'privacy.s4Desc1':
    'MathSonify makes requests to exactly one external service: <strong class="text-sc-text">Google Fonts</strong> (fonts.googleapis.com and fonts.gstatic.com) to load typography. Google Fonts is governed by <a href="https://policies.google.com/privacy" target="_blank" rel="noopener" class="text-sc-accent hover:underline">Google\'s Privacy Policy</a>. We do not control what Google collects when serving these font files, but standard industry practice is that Google does not use font requests for individual user tracking.',
  'privacy.s4Desc2':
    'MathSonify uses no other external scripts, CDNs, analytics providers, advertising networks, or social media embeds. Our JavaScript dependencies (mathjs, React, Astro) are bundled and served from our own domain.',
  'privacy.s5Title': "Children's privacy",
  'privacy.s5Desc1':
    'MathSonify does not knowingly collect personal information from any user, regardless of age. Since our architecture requires no data collection whatsoever, there is no risk of children\'s personal information being compromised through our service.',
  'privacy.s5Desc2':
    '<strong class="text-sc-text">MathSonify is safe and appropriate for ages 5 and up</strong> — the same single standard stated in our Terms of Use. That low minimum is defensible precisely because nothing is collected: with no accounts, no analytics, and nothing ever transmitted, a young child cannot be tracked, profiled, or contacted through the site, so the usual age-related privacy risks have nothing to attach to. The reasoning runs through the whole policy: zero data in means zero data at risk.',
  'privacy.s6Title': 'Changes to this policy',
  'privacy.s6Desc':
    'If this privacy policy is updated, the effective date at the top of this page will be revised and the changes will be posted here. Given MathSonify\'s zero-data architecture, material changes to this policy are unlikely. Any future changes will only expand privacy protections, never reduce them.',
  'privacy.bottomNote':
    'This privacy policy is provided for informational purposes and does not constitute legal advice. MathSonify is committed to transparency about its data practices. If you have questions, reach out at <a href="mailto:privacy@mathsonify.com" class="text-sc-accent hover:underline">privacy@mathsonify.com</a>.',
  'privacy.cta': 'Open Studio',

  // Terms of Use page (same rich-text convention as Privacy)
  'terms.badge': 'terms of service',
  'terms.title': 'Terms of Use',
  'terms.intro':
    'MathSonify is a free creative tool. These terms exist to set clear expectations — not to restrict your creativity.',
  'terms.effective': 'Effective date: September 14, 2026 · Version 1.0',
  'terms.s1Title': 'Acceptance of terms',
  'terms.s1Desc':
    'By accessing or using MathSonify (mathsonify.com), you agree to be bound by these Terms of Use. If you do not agree to these terms, please do not use the service. Your continued use of MathSonify after any modifications to these terms constitutes your acceptance of the revised terms.',
  'terms.sAgeTitle': 'Age guidance',
  'terms.sAgeDesc':
    '<strong class="text-sc-text">MathSonify is safe and appropriate for ages 5 and up.</strong> This is practical guidance rather than something a visitor has to agree to: the site collects no personal data at all — no accounts, no analytics, nothing you type ever leaves your device — so there is nothing here a young visitor would need to sign up for or promise on their own behalf. It is the same single standard stated in our Privacy Policy.',
  'terms.s2Title': 'What MathSonify is',
  'terms.s2Desc1':
    'MathSonify is a browser-based creative tool that converts mathematical expressions into audio in real time. It uses the Web Audio API to synthesize sound from equations, renders visualizations on an HTML Canvas element, and runs entirely on your local device — no server-side processing is involved.',
  'terms.s2Desc2':
    'The service is provided free of charge, with no accounts, subscriptions, or payment required. All equations, audio, and visualizations are generated locally and never leave your browser.',
  'terms.s3Title': 'License to use',
  'terms.s3Intro':
    'MathSonify grants you a free, non-exclusive, revocable, worldwide license to access and use the service for personal, educational, creative, or research purposes. This license is subject to the following conditions:',
  'terms.s3Item1':
    'You may use MathSonify for any lawful purpose, including commercial creative work (e.g., composing music using MathSonify as a tool).',
  'terms.s3Item2':
    'You may not copy, modify, distribute, sell, lease, or sublicense any part of the service, its source code, or its design.',
  'terms.s3Item3':
    'You may not reverse-engineer, decompile, or attempt to extract the source code of MathSonify, except to the extent permitted by applicable law.',
  'terms.s3Item4':
    'You may not use automated systems (bots, scrapers) to access or interact with the service in ways that impose an unreasonable load on the infrastructure.',
  'terms.s4Title': 'Your content',
  'terms.s4Desc1':
    '<strong class="text-sc-text">You own everything you create.</strong> Any equations you enter, audio you generate, and visualizations you produce belong to you. MathSonify processes all content locally on your device — we never see, store, or have access to your work.',
  'terms.s4Desc2':
    'When you export audio as a WAV file, that file is generated entirely by your browser and saved directly to your device. MathSonify does not host, backup, or manage your exported files.',
  'terms.s4Note':
    '<strong class="text-sc-accent">Important:</strong> MathSonify cannot recover lost work. Since all data stays in your browser, clearing your browser data or using a different device will not carry over your session. We recommend exporting any audio you wish to keep.',
  'terms.s5Title': 'Audio safety',
  'terms.s5Intro':
    'MathSonify generates audio in real time from mathematical expressions. While we apply a master dynamics compressor and clipping protection, certain equations may produce:',
  'terms.s5Item1':
    '<strong class="text-sc-text">Sudden loud sounds</strong> — equations with rapid amplitude changes (e.g., exponential growth) can spike in volume.',
  'terms.s5Item2':
    '<strong class="text-sc-text">High frequencies</strong> — fast-oscillating equations may produce tones near or above the upper limit of human hearing (20 kHz).',
  'terms.s5Item3':
    '<strong class="text-sc-text">Rapid timbral shifts</strong> — complex expressions may create dissonant or jarring audio transitions.',
  'terms.s5Note':
    '<strong class="text-sc-accent">Recommendation:</strong> Start at a low volume setting (the slider defaults to 30%). Use quality headphones or speakers. If you have a history of sound-triggered conditions (photosensitive epilepsy, misophonia, hyperacusis), exercise additional caution.',
  'terms.s6Title': 'Prohibited uses',
  'terms.s6Intro':
    'You agree not to use MathSonify for any purpose that is unlawful or prohibited by these terms. Specifically, you may not:',
  'terms.s6Item1':
    'Use the service to generate or distribute content that is harmful, abusive, hateful, or violates the rights of others.',
  'terms.s6Item2':
    'Attempt to disrupt, overload, or gain unauthorized access to the service or its associated infrastructure.',
  'terms.s6Item3':
    'Use the service to deliberately produce audio intended to cause harm, discomfort, or distress to others.',
  'terms.s6Item4':
    'Imply any affiliation with, endorsement by, or official relationship to MathSonify when it does not exist.',
  'terms.s7Title': 'Intellectual property',
  'terms.s7Desc1':
    'MathSonify, including its design, code, branding, documentation, and all associated creative materials, is protected by copyright and applicable intellectual property laws. The MathSonify name, logo, and wordmark are trademarks of MathSonify.',
  'terms.s7Desc2':
    'The preset equation library references publicly known mathematical expressions named after their original authors. These are factual attributions and do not imply any endorsement or affiliation with the named mathematicians or their estates.',
  'terms.s8Title': 'Disclaimer of warranties',
  'terms.s8Intro':
    'MathSonify is provided <strong class="text-sc-text">"as is"</strong> and <strong class="text-sc-text">"as available"</strong> without warranties of any kind, either express or implied. We do not warrant that:',
  'terms.s8Item1': 'The service will be uninterrupted, timely, secure, or error-free.',
  'terms.s8Item2':
    'The mathematical-to-audio translation will be accurate, complete, or meet any particular standard or expectation.',
  'terms.s8Item3': 'The service will be compatible with all browsers, devices, or operating systems.',
  'terms.s8Item4': 'Any content generated through the service will be suitable for any specific purpose.',
  'terms.s9Title': 'Limitation of liability',
  'terms.s9Intro':
    'To the fullest extent permitted by applicable law, MathSonify, its creators, contributors, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the service. This includes, but is not limited to:',
  'terms.s9Item1':
    'Loss of data, revenue, or profits (though MathSonify processes everything locally, so there is no data on our servers to lose).',
  'terms.s9Item2': 'Hearing discomfort or damage resulting from audio generated by mathematical expressions.',
  'terms.s9Item3':
    'Service interruptions, bugs, or errors in the mathematical rendering or audio synthesis pipeline.',
  'terms.s9Outro':
    'Our total aggregate liability for any claim arising from use of the service shall not exceed the amount you paid for the service — which is nothing, since MathSonify is free.',
  'terms.s10Title': 'Modifications and termination',
  'terms.s10Desc1':
    'We reserve the right to modify, suspend, or discontinue MathSonify (or any part of it) at any time, with or without notice. We may also update these terms from time to time. Material changes will be reflected in the "Effective date" at the top of this page.',
  'terms.s10Desc2':
    'Since MathSonify requires no account, there is nothing to "terminate." You are free to stop using the service at any time. If we discontinue the service, any equations you have entered and audio you have exported remain yours — they are stored on your device, not ours.',
  'terms.bottomNote':
    'These terms are provided for informational purposes and do not constitute legal advice. For questions about these terms, contact us at <a href="mailto:legal@mathsonify.com" class="text-sc-accent hover:underline">legal@mathsonify.com</a>.',
  'terms.cta': 'Open Studio',

  // Contact page (brand name, email addresses and the "URGENT" subject
  // marker stay in English; everything else is translated)
  'contact.badge': '♪ resonance channel open',
  'contact.title': 'Let\'s make some <span class="text-sc-accent">noise</span>',
  'contact.intro':
    "Whether you're a mathematician who hears equations, a musician who sees frequencies, or a teacher who wants to bring math to life — we're all ears. Every great signal starts with a transmission.",
  'contact.generalTitle': 'General Inquiries',
  'contact.generalDesc':
    'Questions about how MathSonify works, feature ideas, or just want to say hello? Drop us a line — we read every message like we read every equation.',
  'contact.supportTitle': 'Support',
  'contact.supportDesc':
    'Something sounds off? A graph misbehaving? An equation producing silence when it should scream? Need help using the Studio? Reach out and we\'ll help you get back in tune.',
  'contact.signalTitle': 'The frequency of good ideas',
  'contact.signalDesc':
    'MathSonify started as a simple question: <em class="text-sc-text font-medium">"What does an equation actually sound like?"</em> That curiosity became a platform used by students, musicians, educators, and mathematicians worldwide. Your idea might be the next waveform we build.',
  'contact.timingTitle': 'Response timing',
  'contact.timingDesc':
    'MathSonify is maintained by a small, dedicated team. We aim to respond to all inquiries within 2–3 business days. For urgent issues — like a broken sound engine or a critical build failure — include "URGENT" in your subject line and we\'ll prioritize it.',
  'contact.ideasTitle': 'Ideas and feedback',
  'contact.ideasDesc':
    'MathSonify is shaped by the people who use it. Feature ideas, bug reports, and equation suggestions for our library are all welcome — if you can describe it, we want to hear it. Tell us what would make the Studio better for your classroom, concert, or kitchen-table experiment, and we\'ll add it to the list.',
  'contact.cta': 'Open Studio',

  // Pricing / Premium page ("Premium", "Music Lab", "SoundLab", "Stripe" and
  // "Buy Me a Coffee" are product/brand names and stay in English)
  'pricing.badge': '♪ unlock the Studio',
  'pricing.title': 'MathSonify <span class="text-sc-accent">Premium</span>',
  'pricing.intro':
    'Go deeper. Build your own mathematical instruments, arrange notes, export your work, and access the full SoundLab archive.',
  'pricing.planTitle': 'Premium',
  'pricing.planDesc': 'Full access to everything MathSonify offers.',
  'pricing.perMonth': '/month',
  'pricing.f1': '<strong class="font-semibold">Music Lab</strong> — full mathematical music studio',
  'pricing.f2': '<strong class="font-semibold">Full SoundLab</strong> — all compositions, unlimited plays',
  'pricing.f3': '<strong class="font-semibold">Advanced instruments</strong> — all synthesis models',
  'pricing.f4': '<strong class="font-semibold">WAV export</strong> — download your compositions',
  'pricing.f5': '<strong class="font-semibold">Advanced visualizers</strong> — audio-reactive canvas',
  'pricing.f6': '<strong class="font-semibold">Future premium features</strong> — early access to new tools',
  'pricing.preview': 'Preview',
  'pricing.checkout': 'Continue to secure checkout →',
  'pricing.comingSoon': 'Coming soon',
  'pricing.secureNote': 'Payments are processed securely by Stripe. No storage of card details on our servers.',
  'pricing.waitlistNote': "We're finalizing pricing — join the waitlist to be notified.",
  'pricing.getTitle': 'What you get',
  'pricing.get1': 'Music Lab full studio',
  'pricing.get2': 'Full SoundLab archive',
  'pricing.get3': 'WAV export & advanced visualizers',
  'pricing.billingTitle': 'Billing',
  'pricing.billingDesc':
    'Monthly subscription, cancel anytime. If you cancel, you keep access until the end of your current billing period.',
  'pricing.supportTitle': 'Support',
  'pricing.supportDesc':
    'Questions? Reach us at <a href="mailto:hello@mathsonify.com" class="text-sc-accent underline underline-offset-2">hello@mathsonify.com</a>.',
  'pricing.faqTitle': 'Questions',
  'pricing.faq1Q': 'Is there a free trial?',
  'pricing.faq1A': 'Premium is available immediately. If a trial period is offered, it will be clearly shown before checkout.',
  'pricing.faq2Q': 'What payment methods do you accept?',
  'pricing.faq2A': 'All payments are processed by Stripe, which supports major credit and debit cards.',
  'pricing.faq3Q': 'Can I cancel anytime?',
  'pricing.faq3A': 'Yes. Cancel from your account at any time. Your access continues through the paid period.',
  'pricing.faq4Q': "What if Premium isn't available yet?",
  'pricing.faq4A':
    'The free MathSonify experience, SoundLab previews, and Music Lab remain usable. Premium unlocks the deeper Studio features when it goes live.',
  'pricing.coffeeNote': 'Enjoying MathSonify? You can also support the project directly.',
  'pricing.coffeeCta': '☕ Buy Me a Coffee',

  // Error pages — 500 / 503 (plain text; the retry button's "Retrying…"
  // state is set by the page's own inline script)
  'error500.badge': 'Error 500 · system fault',
  'error500.code': 'f(x) → system error',
  'error500.title': 'The equation broke somewhere.',
  'error500.desc': 'MathSonify hit an unexpected problem. Give it another moment and try again.',
  'error500.retry': 'Try Again',
  'error500.home': 'Back to MathSonify',
  'error500.note': 'If this keeps happening, the problem is on our side rather than yours.',
  'error500.retrying': 'Retrying…',
  'error503.badge': 'Error 503 · maintenance',
  'error503.code': 'f(x) → resting',
  'error503.title': 'Taking a short breather.',
  'error503.desc':
    'MathSonify is down for a moment — a deploy, a tune-up, something small. The equations will be right back.',
  'error503.retry': 'Try Again',
  'error503.home': 'Back to MathSonify',
  'error503.note': 'Usually just a few minutes. If it lasts longer, something bigger broke — check back soon.',
  'error503.retrying': 'Retrying…',

  // Error pages — 404 (the "drawing…" / "…and then nothing." states are
  // transient script states and stay in the page's own inline script)
  'error404.status': 'status 404 · undefined',
  'error404.undefinedAt': 'undefined at x = 404',
  'error404.title': "This point doesn't exist.",
  'error404.sub': "The page isn't on the curve — everything else still is.",
  'error404.back': 'Back to MathSonify',
  'error404.studio': 'Open Studio',
  'error404.equations': 'Explore equations',
  'error404.replay': '↻ replay the curve',
  'error404.sonify': '♪ draw it with sound',
  'error404.tap': 'tap the break — hear it',
  'error404.footer':
    'No solution here — try the <a href="/equations" class="text-sc-accent underline underline-offset-2 hover:no-underline transition-colors">equation library</a> instead.',
  'error404.replayAria': 'Replay the curve drawing',
  'error404.sonifyAria': 'Draw the curve again with sound following it',
  'error404.tapAria': 'Tap the break — hear the curve fail',
  'error404.equationAria': 'Equation',

  // Offline page (the standalone page the service worker serves; the
  // strings are also embedded inline there so they work with no network)
  'offline.pill': 'offline',
  'offline.pillOnline': 'back online',
  'offline.title': 'The signal <em>dropped.</em>',
  'offline.titleOnline': 'Signal <em>restored.</em>',
  'offline.subOffline':
    'You are not connected, but the Studio still runs on your device. Equations are drawn and played right here.',
  'offline.subNoCache':
    'You are not connected right now. Check your Wi-Fi or mobile data — we will be here when you are back.',
  'offline.subOnline': 'You are connected again. Nothing was lost — pick up exactly where you left off.',
  'offline.noRoute': 'no route',
  'offline.deviceCap': 'your device · f(x) = sin(x)',
  'offline.internetCap': 'the internet',
  'offline.internetCapOnline': 'the internet · connected',
  'offline.retry': 'Try again',
  'offline.continue': 'Continue',
  'offline.openStudio': 'Open the Studio →',
  'offline.hear': '♪ Hear the signal',
  'offline.statusWaiting': 'waiting for a connection… we will reconnect automatically',
  'offline.statusOnline': '<b>connected</b> · welcome back',
  'offline.statusStill': 'still offline — nothing came back',
  'offline.worksTitle': 'Still works, offline',
  'offline.works1': 'Studio — type, graph, play',
  'offline.works2': 'Guess — practice rounds',
  'offline.works3': 'Exports you already made',
  'offline.needsTitle': 'Needs the internet',
  'offline.needs1': 'Opening shared links',
  'offline.needs2': 'Notify-me sign-ups',
  'offline.needs3': 'Support and payments',
  'offline.footer': 'MathSonify.com · your equations are drawn on your device',
  'offline.toastOnline': 'Back online',
  'offline.toastOffline': 'Connection lost',
  'offline.toastSteady': 'A steady signal',
  'offline.toastSilence': '…and then silence',

  // Redirect page
  'create.moved': 'This page has moved to <a href="/studio">the MathSonify Studio</a>.',
} as const;

export default en;
export type TranslationKey = keyof typeof en;

