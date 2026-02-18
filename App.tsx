import React, { useState, useEffect, useRef } from 'react';
import { AppState, GeneratedVariant } from './types';
import {
  generateProfessionalListing,
  generateImageVariant,
} from './services/geminiService';
import { AppSidebar } from './components/AppSidebar';
import { Badge } from './components/Badge';
import { ListingCard } from './components/ListingCard';
import { ImageGallery } from './components/ImageGallery';

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem('productpro-theme');
      return saved ? saved === 'dark' : false;
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

  const [isListening, setIsListening] = useState(false);
  const [isMobileOpen, setMobileOpen] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    try {
      localStorage.setItem('productpro-theme', isDark ? 'dark' : 'light');
    } catch { /* noop */ }
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDark]);

  // Setup speech recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const part = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += part;
          } else {
            interimTranscript += part;
          }
        }

        if (finalTranscript || interimTranscript) {
          setState((prev) => {
            const base = finalTranscript
              ? prev.rawDescription + ' ' + finalTranscript
              : prev.rawDescription;
            return {
              ...prev,
              rawDescription: (
                base + (interimTranscript ? ' ' + interimTranscript : '')
              )
                .trim()
                .replace(/\s\s+/g, ' '),
            };
          });
        }
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const runPipeline = async () => {
    if (state.originalImages.length === 0) {
      setState((prev) => ({
        ...prev,
        error: 'Please upload at least one product photo to get started.',
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isProcessing: true,
      statusMessage: 'Analyzing product images...',
      error: null,
      variants: [],
      listing: null,
    }));

    try {
      const listing = await generateProfessionalListing(
        state.originalImages,
        state.rawDescription
      );
      setState((prev) => ({
        ...prev,
        listing,
        statusMessage: 'Generating image variants...',
      }));

      const variantTypes: ('Studio' | 'Lifestyle' | 'Contextual')[] = [
        'Studio',
        'Lifestyle',
        'Contextual',
      ];
      const primaryImage = state.originalImages[0];
      const newVariants: GeneratedVariant[] = [];

      for (const type of variantTypes) {
        try {
          setState((prev) => ({
            ...prev,
            statusMessage: `Rendering ${type} variant...`,
          }));
          const url = await generateImageVariant(
            primaryImage,
            type,
            listing.title
          );
          newVariants.push({
            id: Math.random().toString(36).substr(2, 9),
            url,
            type,
            prompt: `${type} render`,
          });
          setState((prev) => ({ ...prev, variants: [...newVariants] }));
        } catch (e) {
          console.warn(`Variant ${type} failed:`, e);
        }
      }

      setState((prev) => ({
        ...prev,
        isProcessing: false,
        statusMessage: 'Complete',
      }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: err.message || 'An error occurred. Please try again.',
      }));
    }
  };

  return (
    <div
      className={`flex min-h-screen font-sans transition-colors duration-300 ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      <AppSidebar
        state={state}
        setState={setState}
        isDark={isDark}
        setIsDark={setIsDark}
        isListening={isListening}
        toggleListening={toggleListening}
        onRunPipeline={runPipeline}
        isMobileOpen={isMobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Mobile Header */}
        <div
          className={`sticky top-0 z-30 lg:hidden flex items-center justify-between p-4 border-b backdrop-blur-lg ${
            isDark
              ? 'bg-slate-950/90 border-slate-800'
              : 'bg-white/90 border-slate-200'
          }`}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Open menu"
          >
            <i className="fas fa-bars text-lg"></i>
          </button>
          <div className="flex items-center gap-2">
            <div className="bg-red-500 p-1.5 rounded-lg">
              <i className="fas fa-bolt text-white text-xs"></i>
            </div>
            <span className="font-extrabold text-sm uppercase tracking-tight">
              ProductPro
            </span>
          </div>
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Toggle theme"
          >
            <i
              className={`fas ${
                isDark ? 'fa-sun text-amber-400' : 'fa-moon text-slate-400'
              }`}
            ></i>
          </button>
        </div>

        <div className="px-4 md:px-8 lg:px-12 xl:px-16 py-8 lg:py-12 max-w-5xl mx-auto">
          {/* Page Header */}
          <div className="mb-10">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge color="red">AI Powered</Badge>
              <Badge color="blue">Asset Pipeline</Badge>
            </div>
            <h1
              className={`text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-balance ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              Production Workspace
            </h1>
            <p className="text-sm text-slate-400 mt-2 max-w-lg leading-relaxed">
              Upload product photos and optional context. The AI engine will generate
              professional listings and HD image variants.
            </p>
          </div>

          {/* Processing State */}
          {state.isProcessing && (
            <div className="mb-10 animate-fade-in">
              <div
                className={`p-6 md:p-8 rounded-2xl border-2 flex items-center gap-6 ${
                  isDark
                    ? 'bg-slate-900 border-red-500/20'
                    : 'bg-white border-red-500/10 shadow-lg'
                }`}
              >
                <div className="w-12 h-12 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin shrink-0"></div>
                <div>
                  <span className="text-lg md:text-xl font-extrabold tracking-tight block">
                    {state.statusMessage}
                  </span>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <i className="fas fa-microchip"></i> Processing with Gemini AI
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!state.listing && !state.isProcessing && (
            <div
              className={`py-20 md:py-32 text-center rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-6 ${
                isDark
                  ? 'border-slate-800 bg-slate-900/30'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center ${
                  isDark ? 'bg-slate-800' : 'bg-slate-100'
                }`}
              >
                <i
                  className={`fas fa-wand-magic-sparkles text-3xl ${
                    isDark ? 'text-slate-700' : 'text-slate-300'
                  }`}
                ></i>
              </div>
              <div className="space-y-2">
                <p
                  className={`font-extrabold text-xl uppercase tracking-tight ${
                    isDark ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Ready to Generate
                </p>
                <p
                  className={`text-xs font-bold uppercase tracking-widest ${
                    isDark ? 'text-slate-800' : 'text-slate-300'
                  }`}
                >
                  Upload photos and hit Execute Pipeline
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {state.listing && (
            <div className="space-y-12 animate-fade-in pb-16">
              <ListingCard listing={state.listing} isDark={isDark} />
              <ImageGallery
                variants={state.variants}
                isProcessing={state.isProcessing}
                isDark={isDark}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
