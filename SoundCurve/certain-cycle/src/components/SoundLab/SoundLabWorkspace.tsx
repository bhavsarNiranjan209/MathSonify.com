import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COMPOSITIONS, COPYRIGHT, GENRES, type Composition } from '../../data/compositions';
import { useTranslation } from '../../i18n/index';
import { useSoundLabStore } from '../../store/soundLabStore';
import { compositionEngine } from '../../utils/compositionEngine';
import { filterCompositions, adjacentComposition, type SoundLabCategory } from '../../utils/soundLabLibrary';
import { isPremiumUser, isSoundLabTeaserPhase, soundLabFreeAccessLevel, soundLabFreePlayLimit, soundLabPhase } from '../../utils/musicLabAccess';
import CompositionPlayer from './CompositionPlayer';
import SoundLabLibrary from './SoundLabLibrary';

function readInitialId(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('composition');
  return COMPOSITIONS.some((composition) => composition.id === value) ? value : null;
}

export default function SoundLabWorkspace() {
  const { t } = useTranslation();
  const selectedId = useSoundLabStore((state) => state.selectedId);
  const selectedTrackId = useSoundLabStore((state) => state.selectedTrackId);
  const select = useSoundLabStore((state) => state.select);
  const resetForComposition = useSoundLabStore((state) => state.resetForComposition);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SoundLabCategory>('all');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryTriggerRef = useRef<HTMLButtonElement>(null);
  const libraryDialogRef = useRef<HTMLElement>(null);
  const visible = useMemo(() => filterCompositions(COMPOSITIONS, { category, query }), [category, query]);
  const selected = COMPOSITIONS.find((composition) => composition.id === selectedId) ?? visible[0] ?? COMPOSITIONS[0];
  const selectedTrack = selected.tracks.find((track) => track.id === selectedTrackId) ?? selected.tracks[0];
  const phase = soundLabPhase();
  const playable = soundLabFreeAccessLevel() !== 'none'
    && !isSoundLabTeaserPhase()
    && (phase !== 'premium' || isPremiumUser());

  useEffect(() => {
    const initial = readInitialId() ?? COMPOSITIONS[0].id;
    const initialComposition = COMPOSITIONS.find((composition) => composition.id === initial) ?? COMPOSITIONS[0];
    select(initialComposition.id);
    resetForComposition(initialComposition.tracks.map((track) => track.id));
    const syncFromUrl = () => {
      const requested = readInitialId() ?? COMPOSITIONS[0].id;
      const next = COMPOSITIONS.find((composition) => composition.id === requested) ?? COMPOSITIONS[0];
      if (!next || next.id === useSoundLabStore.getState().selectedId) return;
      compositionEngine.stop();
      useSoundLabStore.getState().select(next.id);
      useSoundLabStore.getState().resetForComposition(next.tracks.map((track) => track.id));
    };
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [resetForComposition, select]);

  useEffect(() => {
    if (!libraryOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      libraryDialogRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLibraryOpen(false);
        libraryTriggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [libraryOpen]);

  useEffect(() => () => { compositionEngine.stop(); }, []);

  const chooseComposition = useCallback((composition: Composition, pushHistory = true) => {
    const changed = useSoundLabStore.getState().selectedId !== composition.id;
    compositionEngine.stop();
    select(composition.id);
    resetForComposition(composition.tracks.map((track) => track.id));
    setLibraryOpen(false);
    if (pushHistory && changed) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('composition', composition.id);
      window.history.pushState({}, '', nextUrl);
    }
  }, [resetForComposition, select]);

  const move = useCallback((direction: -1 | 1) => {
    const next = adjacentComposition(visible, selected.id, direction);
    if (next) chooseComposition(next);
  }, [chooseComposition, selected.id, visible]);

  return (
    <>
      <a href="#soundlab-composition" className="sr-only rounded-md bg-sc-accent px-4 py-3 font-semibold text-sc-on-accent focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]">{t('soundlab.skipToPlayer')}</a>
      <main id="main-content" className="soundlab min-h-screen bg-sc-bg px-4 pb-16 pt-20 text-sc-text sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sc-accent">{t('soundlab.eyebrow')}</p><h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{t('soundlab.soundlabLabel')}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-sc-text-soft">{t('soundlab.subtitle')}</p></div><button ref={libraryTriggerRef} type="button" onClick={() => setLibraryOpen(true)} className="btn-ghost min-h-[44px] px-3 text-xs lg:hidden" aria-expanded={libraryOpen} aria-controls="soundlab-mobile-library">{t('soundlab.compositions')}</button></header>
        {phase === 'limited-free' && <div className="panel mb-4 border-sc-accent/30 px-4 py-3 text-xs text-sc-text-soft">{t('soundlab.earlyAccessLimited')} {soundLabFreePlayLimit()} {t('soundlab.compositionsAvailableToday')}</div>}
        {phase === 'teaser' && <div className="panel mb-4 border-sc-accent/30 px-4 py-3 text-xs text-sc-text-soft">{t('soundlab.previewNotice')}</div>}
        <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          <aside className="panel sticky top-20 hidden h-[calc(100dvh-6rem)] min-h-[560px] overflow-hidden lg:block" aria-label="SoundLab Library"><SoundLabLibrary query={query} onQueryChange={setQuery} category={category} onCategoryChange={setCategory} onSelect={chooseComposition} /></aside>
          <section id="soundlab-composition" tabIndex={-1} className="min-w-0 scroll-mt-24 space-y-5 outline-none" aria-label="Selected composition">
            <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sc-text-faint">{t('soundlab.nowSelected')}</p><h2 className="mt-1 font-serif text-2xl font-semibold">{selected.title}</h2></div>
            <CompositionPlayer key={selected.id} initialId={selected.id} playable={playable} phase={phase} onPrevious={() => move(-1)} onNext={() => move(1)} canPrevious={visible.length > 1} canNext={visible.length > 1} />
          </section>
          <aside className="panel min-w-0 p-4 xl:sticky xl:top-20" aria-labelledby="composition-info-heading"><h3 id="composition-info-heading" className="text-sm font-semibold">{t('soundlab.selectedTrack')}</h3><p className="mt-1 text-sm font-medium text-sc-text">{selectedTrack.label}</p><p className="code-mat mt-3 max-h-32 overflow-y-auto break-words p-2.5 text-[10px] leading-relaxed">{selectedTrack.equation}</p><dl className="mt-4 divide-y divide-sc-line/10"><div className="flex items-center justify-between gap-3 py-2 text-xs"><dt className="text-sc-text-faint">{t('soundlab.type')}</dt><dd>{selectedTrack.voice}</dd></div><div className="flex items-center justify-between gap-3 py-2 text-xs"><dt className="text-sc-text-faint">{t('soundlab.instrument')}</dt><dd>{selectedTrack.instrument}</dd></div></dl><details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-sc-accent">{t('soundlab.viewEquation')}</summary><p className="mt-2 text-xs leading-relaxed text-sc-text-soft">{t('soundlab.equationNote')}</p></details><h3 className="mt-6 border-t border-sc-line/10 pt-5 text-sm font-semibold">{t('soundlab.compositionInfo')}</h3><dl className="mt-3 divide-y divide-sc-line/10">{[[t('soundlab.composition'), selected.title], [t('soundlab.genre'), GENRES.find((genre) => genre.id === selected.genre)?.label ?? selected.genre], [t('soundlab.bpm'), String(selected.bpm)], [t('soundlab.scale'), selected.key], [t('soundlab.duration'), `${selected.durationSec} ${t('soundlab.seconds')}`], [t('soundlab.tracks'), String(selected.tracks.length)], [t('soundlab.status'), t('soundlab.proprietary')]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 py-2 text-xs"><dt className="text-sc-text-faint">{label}</dt><dd className="text-right font-medium text-sc-text">{value}</dd></div>)}</dl><p className="mt-4 border-t border-sc-line/10 pt-4 text-[10px] leading-relaxed text-sc-text-faint">{COPYRIGHT}<br />{t('soundlab.rights')}</p></aside>
        </div>
        <section className="panel mt-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6" aria-labelledby="create-own-heading"><div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sc-text-faint">{t('soundlab.beyondListening')}</p><h2 id="create-own-heading" className="mt-1 font-serif text-xl font-semibold">{t('soundlab.createOwn')}</h2><p className="mt-1 text-sm text-sc-text-soft">{t('soundlab.createOwnDesc')}</p></div><a href="/music-lab" className="btn-primary min-h-[44px] shrink-0 px-4 text-xs">{t('soundlab.openMusicLab')}</a></section>
        {libraryOpen && <div className="fixed inset-0 z-50 lg:hidden"><button type="button" className="absolute inset-0 bg-black/60" aria-label={t('soundlab.closeLibrary')} onClick={() => { setLibraryOpen(false); libraryTriggerRef.current?.focus(); }} /><aside ref={libraryDialogRef} id="soundlab-mobile-library" className="absolute inset-x-0 bottom-0 top-16 overflow-hidden border-t border-sc-line/20 bg-sc-bg shadow-2xl" role="dialog" aria-modal="true" aria-label={t('soundlab.library')}><div className="flex items-center justify-between border-b border-sc-line/15 px-4 py-3"><h2 className="text-sm font-semibold">{t('soundlab.compositions')}</h2><button type="button" onClick={() => { setLibraryOpen(false); libraryTriggerRef.current?.focus(); }} className="btn-ghost min-h-[40px] px-3 text-xs">Close</button></div><div className="h-[calc(100%-3.25rem)]"><SoundLabLibrary query={query} onQueryChange={setQuery} category={category} onCategoryChange={setCategory} onSelect={chooseComposition} onNavigate={() => { setLibraryOpen(false); libraryTriggerRef.current?.focus(); }} /></div></aside></div>}
      </div>
    </main>
    </>
  );
}
