import React, { useState, useEffect, useCallback } from 'react';
import { AppState, GeneratedVariant } from './types';
import { generateProfessionalListing, generateImageVariant } from './services/geminiService';
import { Badge } from './components/UIComponents';
import { ImageUploader } from './components/ImageUploader';
import { DescriptionInput } from './components/DescriptionInput';
import { ListingDisplay } from './components/ListingDisplay';
import { VariantGallery } from './components/VariantGallery';

const VARIANT_TYPES: ('Studio' | 'Lifestyle' | 'Contextual')[] = ['Studio', 'Lifestyle', 'Contextual'];

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem('productpro-theme');
      return saved === 'dark';
    } catch {
      return false;
    }
  });

  const [state, setState] = useState<AppState>({
    originalImages: [],
    rawDescription: '',
    isProcessing: false,
    listing: null,
    variants: [],
    error: null,
    statusMessage: '',
  });

  useEffect(() => {
    try {
      localStorage.setItem('productpro-theme', isDark ? 'dark' : 'light');
    } catch { /* noop */ }
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const toggleTheme = useCallback(() => setIsDark((d) => !d), []);

  const handleImagesChange = useCallback((images: string[]) => {
    setState((prev) => ({ ...prev, originalImages: images }));
  }, []);

  const handleDescriptionChange = useCallback((value: string) => {
    setState((prev) => ({ ...prev, rawDescription: value }));
  }, []);

  const runPipeline = useCallback(async () => {
    if (state.originalImages.length === 0) {
      setState((prev) => ({ ...prev, error: 'Upload product imagery to initiate production.' }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isProcessing: true,
      statusMessage: 'Processing Assets...',
      error: null,
      variants: [],
      listing: null,
    }));

    try {
      const listing = await generateProfessionalListing(state.originalImages, state.rawDescription);
      setState((prev) => ({ ...prev, listing, statusMessage: 'Rendering All Views in Parallel...' }));

      // Generate all 3 variants in parallel for speed
      const primaryImage = state.originalImages[0];
      const results = await Promise.allSettled(
        VARIANT_TYPES.map(async (type) => {
          const url = await generateImageVariant(primaryImage, type, listing.title);
          const variant: GeneratedVariant = {
            id: crypto.randomUUID(),
            url,
            type,
            prompt: `High-fidelity ${type} render`,
          };
          // Update UI as each variant completes
          setState((prev) => ({ ...prev, variants: [...prev.variants, variant] }));
          return variant;
        })
      );

      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        console.warn(`${failed.length} variant(s) failed to generate.`);
      }

      setState((prev) => ({ ...prev, isProcessing: false, statusMessage: 'Production Complete' }));
    } catch (err: any) {
      setState((prev) => ({ ...prev, isProcessing: false, error: err.message || 'System Fault' }));
    }
  }, [state.originalImages, state.rawDescription]);

  return (
    <div className={`flex min-h-screen font-sans transition-colors duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#fcfdfe] text-slate-900'}`}>
      {/* SIDEBAR */}
      <aside
        className={`w-[380px] p-10 flex flex-col gap-12 border-r sticky top-0 h-screen overflow-y-auto z-40 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xl'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-[#ff4b4b] p-3 rounded-2xl shadow-lg shadow-red-500/20">
              <i className="fas fa-bolt text-white text-xl"></i>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tighter">ProductPro</h1>
          </div>
          <button
            onClick={toggleTheme}
            className="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle theme"
          >
            <i className={`fas ${isDark ? 'fa-sun text-amber-400' : 'fa-moon text-slate-500'}`}></i>
          </button>
        </div>

        <div className="space-y-12">
          <ImageUploader images={state.originalImages} isDark={isDark} onImagesChange={handleImagesChange} />
          <DescriptionInput value={state.rawDescription} isDark={isDark} onChange={handleDescriptionChange} />
        </div>

        <div className="mt-auto pt-8 border-t dark:border-slate-800">
          <button
            onClick={runPipeline}
            disabled={state.isProcessing}
            className={`w-full py-6 rounded-[2.5rem] font-black text-sm uppercase tracking-widest transition-colors shadow-2xl active:scale-95 ${
              state.isProcessing
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-[#ff4b4b] text-white hover:bg-red-600 shadow-red-500/30'
            }`}
          >
            {state.isProcessing ? (
              <>
                <i className="fas fa-sync fa-spin mr-3"></i> Optimizing Assets
              </>
            ) : (
              'Execute Pipeline'
            )}
          </button>
          {state.error && (
            <div className="mt-6 p-6 rounded-3xl bg-red-500/10 border-2 border-red-500/20 text-red-500 text-sm font-bold flex gap-4 animate-fade-in">
              <i className="fas fa-exclamation-triangle mt-1 shrink-0"></i>
              <p>{state.error}</p>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN PANEL */}
      <main className="flex-1 px-20 py-16 overflow-y-auto scroll-smooth">
        <div className="max-w-[1100px] mx-auto">
          <header className="mb-16">
            <div className="flex items-center gap-4 mb-4">
              <Badge color="red">Enterprise v2.1</Badge>
              <Badge color="blue">Optimized Asset Pipeline</Badge>
            </div>
            <h1 className={`text-6xl font-black tracking-tighter text-balance ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Production Workspace
            </h1>
          </header>

          {state.isProcessing && (
            <div className="mb-16 animate-slide-in-top">
              <div
                className={`p-12 rounded-[4rem] border-4 border-red-500/10 flex flex-col gap-8 ${
                  isDark ? 'bg-slate-900 shadow-2xl' : 'bg-white shadow-2xl'
                }`}
              >
                <div className="flex items-center gap-8">
                  <div className="w-16 h-16 border-[6px] border-red-500/10 border-t-red-500 rounded-full animate-spin"></div>
                  <div>
                    <span className="text-3xl font-black tracking-tight block mb-1">{state.statusMessage}</span>
                    <span className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-microchip"></i> Parallel GPU Pipeline Active
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!state.listing && !state.isProcessing && (
            <div
              className={`p-48 text-center rounded-[5rem] border-4 border-dashed flex flex-col items-center justify-center gap-10 ${
                isDark ? 'border-slate-800 bg-slate-900/30' : 'border-slate-100 bg-white'
              }`}
            >
              <div className="w-36 h-36 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-200 dark:text-slate-800 shadow-inner">
                <i className="fas fa-magic text-6xl opacity-20"></i>
              </div>
              <div className="space-y-4">
                <p className="font-black text-3xl uppercase tracking-tighter opacity-10 text-slate-500">Asset Engine Ready</p>
                <p className="text-xs opacity-10 font-black uppercase tracking-[0.5em] text-slate-500">
                  Provide photos and context to initiate pipeline
                </p>
              </div>
            </div>
          )}

          {state.listing && (
            <div className="space-y-24 animate-fade-in pb-32">
              <ListingDisplay listing={state.listing} isDark={isDark} />
              <VariantGallery variants={state.variants} isDark={isDark} isProcessing={state.isProcessing} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
