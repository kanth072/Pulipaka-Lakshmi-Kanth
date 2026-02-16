
import React, { useState, useEffect, useRef } from 'react';
import { AppState, GeneratedVariant, ProductListing } from './types';
import { generateProfessionalListing, generateImageVariant } from './services/geminiService';

// --- Streamlit-like UI Components ---

const StHeader = ({ children, isDark }: { children?: React.ReactNode, isDark: boolean }) => (
  <h1 className={`text-3xl font-extrabold mb-6 border-b pb-4 tracking-tight transition-colors ${isDark ? 'text-slate-100 border-slate-800' : 'text-slate-900 border-slate-200'}`}>
    {children}
  </h1>
);

const StInfo = ({ children, isDark }: { children?: React.ReactNode, isDark: boolean }) => (
  <div className={`border-l-4 p-4 my-4 text-sm flex items-center gap-3 rounded-r-lg shadow-sm transition-colors ${isDark ? 'bg-blue-900/30 border-blue-500 text-blue-200' : 'bg-blue-50 border-blue-500 text-blue-700'}`}>
    <i className="fas fa-info-circle text-blue-500 text-base"></i>
    <div className="font-medium">{children}</div>
  </div>
);

const StSuccess = ({ children, isDark }: { children?: React.ReactNode, isDark: boolean }) => (
  <div className={`border-l-4 p-4 my-4 text-sm flex items-center gap-3 rounded-r-lg shadow-sm transition-colors ${isDark ? 'bg-green-900/30 border-green-500 text-green-200' : 'bg-green-50 border-green-500 text-green-700'}`}>
    <i className="fas fa-check-circle text-green-500 text-base"></i>
    <div className="font-semibold">{children}</div>
  </div>
);

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('productpro-theme');
    return saved ? saved === 'dark' : false;
  });

  const [hasPersonalKey, setHasPersonalKey] = useState(false);
  const [state, setState] = useState<AppState>({
    originalImages: [],
    rawDescription: '',
    isProcessing: false,
    listing: null,
    variants: [],
    error: null,
    statusMessage: ''
  });

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setHasPersonalKey(hasKey);
      }
    };
    checkKey();
    localStorage.setItem('productpro-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.lang = 'en-IN';
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) {
          setState(prev => ({ ...prev, rawDescription: (prev.rawDescription ? prev.rawDescription + ' ' : '') + finalTranscript.trim() }));
        }
      };
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const handleSelectKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasPersonalKey(true);
      setState(prev => ({ ...prev, error: null }));
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) recognitionRef.current.stop();
    else { setIsListening(true); recognitionRef.current.start(); }
  };

  // Fix: Adding the missing handleFileChange function to handle multiple product photo uploads
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileList = Array.from(files);
    const readPromises = fileList.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve(event.target?.result as string);
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then(base64Images => {
      setState(prev => ({
        ...prev,
        originalImages: [...prev.originalImages, ...base64Images]
      }));
    });
  };

  const generateImagesOnly = async (listingTitle: string) => {
    setState(prev => ({ ...prev, isProcessing: true, statusMessage: '🎨 Rendering HD catalog images...', error: null }));
    try {
      const variantTypes: ('Studio' | 'Lifestyle' | 'Contextual')[] = ['Studio', 'Lifestyle', 'Contextual'];
      const primaryImage = state.originalImages[0];
      
      const variantPromises = variantTypes.map(async (type) => {
        try {
          const url = await generateImageVariant(primaryImage, type, listingTitle);
          return { id: Math.random().toString(36).substr(2, 9), url, type, prompt: `Professional ${type}` } as GeneratedVariant;
        } catch (e) { return null; }
      });

      const results = await Promise.all(variantPromises);
      const successful = results.filter((v): v is GeneratedVariant => v !== null);
      
      if (successful.length === 0) throw new Error("Image generation failed due to quota limits. Try connecting a personal key.");

      setState(prev => ({ ...prev, variants: successful, isProcessing: false, statusMessage: '✅ Complete' }));
    } catch (err: any) {
      let msg = err.message || "Image generation failed";
      if (msg.includes("429") || msg.includes("quota")) msg = "Image Quota Exceeded. Connect a personal key to generate HD images.";
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
    }
  };

  const runPipeline = async () => {
    if (state.originalImages.length === 0) {
      setState(prev => ({ ...prev, error: "Please upload at least one product photo." }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, statusMessage: `🤖 Analyzing photos and generating text...`, error: null, variants: [], listing: null }));

    try {
      const listing = await generateProfessionalListing(state.originalImages, state.rawDescription);
      setState(prev => ({ ...prev, listing }));
      await generateImagesOnly(listing.title);
    } catch (err: any) {
      let msg = err.message || "Pipeline failed";
      if (msg.includes("429") || msg.includes("quota")) msg = "Quota Exceeded. Please connect your own API key in the sidebar.";
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
    }
  };

  return (
    <div className={`flex min-h-screen font-sans ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#f8fafc] text-slate-900'}`}>
      
      {/* Sidebar - Higher Z-index to stay on top */}
      <aside className={`w-[360px] p-8 flex flex-col gap-6 border-r transition-all z-30 sticky top-0 h-screen overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xl'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff4b4b] p-2 rounded-lg"><i className="fas fa-bolt text-white text-xl"></i></div>
            <h1 className="text-xl font-black uppercase tracking-tighter">ProductPro</h1>
          </div>
          <button onClick={() => setIsDark(!isDark)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <i className={`fas ${isDark ? 'fa-sun text-amber-400' : 'fa-moon text-slate-500'}`}></i>
          </button>
        </div>

        <div className={`p-4 rounded-xl border flex flex-col gap-2 ${hasPersonalKey ? (isDark ? 'bg-green-950/20 border-green-900' : 'bg-green-50 border-green-100') : (isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100')}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-widest ${hasPersonalKey ? 'text-green-500' : 'text-slate-500'}`}>
              <i className={`fas ${hasPersonalKey ? 'fa-key' : 'fa-unlock'} mr-1.5`}></i>
              {hasPersonalKey ? 'Personal Key' : 'Shared Key'}
            </span>
            <button onClick={handleSelectKey} className="text-[10px] font-black text-blue-500 hover:underline uppercase tracking-widest">
              {hasPersonalKey ? 'Change' : 'Connect'}
            </button>
          </div>
          {!hasPersonalKey && <p className="text-[9px] font-bold text-slate-400 leading-tight">Shared key exhausted? Connect your own <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline">AI Studio key</a>.</p>}
        </div>

        <section className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Upload Photos</label>
            <div className={`p-4 border-2 border-dashed rounded-xl ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <input type="file" accept="image/*" multiple onChange={handleFileChange} className="text-[10px] w-full file:bg-[#ff4b4b] file:text-white file:border-0 file:rounded-full file:px-3 file:py-1 file:font-black" />
              <div className="mt-4 grid grid-cols-3 gap-2">
                {state.originalImages.map((img, idx) => (
                  <div key={idx} className="relative aspect-square">
                    <img src={img} className="w-full h-full object-cover rounded-lg border shadow-sm" alt="Thumbnail" />
                    <button onClick={() => setState(p => ({ ...p, originalImages: p.originalImages.filter((_, i) => i !== idx) }))} className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[8px] flex items-center justify-center shadow-lg"><i className="fas fa-times"></i></button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Description</label>
              <button onClick={toggleListening} className={`text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                <i className="fas fa-microphone"></i> {isListening ? 'STOP' : 'VOICE'}
              </button>
            </div>
            <textarea value={state.rawDescription} onChange={(e) => setState(p => ({ ...p, rawDescription: e.target.value }))} placeholder="Key features..." className={`w-full h-24 p-3 rounded-xl border-2 text-sm focus:border-[#ff4b4b] outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-100 shadow-inner'}`} />
          </div>
        </section>

        <div className="mt-auto space-y-3">
          <button onClick={runPipeline} disabled={state.isProcessing} className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-xl ${state.isProcessing ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-[#ff4b4b] text-white hover:bg-red-600 active:scale-95'}`}>
            {state.isProcessing ? <><i className="fas fa-spinner fa-spin mr-2"></i> Working...</> : '🚀 Start Pipeline'}
          </button>

          {state.error && (
            <div className={`p-4 rounded-xl border text-[11px] font-bold leading-relaxed break-words shadow-lg ${isDark ? 'bg-red-950/20 border-red-900 text-red-400' : 'bg-red-50 border-red-200 text-red-700'}`}>
              <div className="flex gap-2 mb-2"><i className="fas fa-exclamation-circle shrink-0 mt-0.5"></i> {state.error}</div>
              {state.error.includes("Quota") && (
                <button onClick={handleSelectKey} className="w-full py-2 bg-[#ff4b4b] text-white rounded-lg hover:bg-red-600 uppercase text-[9px] font-black">Select Personal API Key</button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 px-12 py-16 overflow-y-auto z-10 relative scroll-smooth">
        <div className="max-w-[800px] mx-auto">
          <StHeader isDark={isDark}>Asset Dashboard</StHeader>
          
          {state.isProcessing && <StInfo isDark={isDark}>{state.statusMessage}</StInfo>}

          {!state.listing && !state.isProcessing && (
            <div className={`p-20 text-center rounded-3xl border-2 border-dashed ${isDark ? 'border-slate-800 bg-slate-900/50 text-slate-600' : 'border-slate-200 bg-white text-slate-300'}`}>
              <i className="fas fa-wand-sparkles text-5xl mb-4"></i>
              <p className="font-bold">Awaiting Input. Results will appear here.</p>
            </div>
          )}

          {state.listing && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div className={`p-8 rounded-2xl shadow-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-[10px] font-black text-[#ff4b4b] uppercase tracking-widest block mb-1">Generated Catalog Draft</span>
                    <h2 className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{state.listing.title}</h2>
                  </div>
                  <StSuccess isDark={isDark}>Copy Optimized</StSuccess>
                </div>
                <div className={`p-5 rounded-xl italic font-medium mb-8 border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                  "{state.listing.description}"
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {state.listing.specifications.map((s, i) => (
                    <div key={i} className={`p-3 border rounded-lg ${isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50'}`}>
                      <span className="text-[9px] font-black text-slate-500 uppercase block">{s.key}</span>
                      <span className="text-sm font-bold">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {state.variants.length > 0 ? (
                <div className="grid grid-cols-1 gap-12 pt-8 border-t dark:border-slate-800">
                  <h3 className="text-xl font-black uppercase tracking-tight">HD Image Gallery</h3>
                  {state.variants.map((v) => (
                    <div key={v.id} className="rounded-3xl overflow-hidden shadow-2xl border dark:border-slate-800 group relative">
                      <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { const a = document.createElement('a'); a.href = v.url; a.download = `${v.type}.png`; a.click(); }} className="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-[10px] font-black text-slate-900 shadow-xl border border-slate-200">
                          <i className="fas fa-download mr-1"></i> SAVE
                        </button>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b dark:border-slate-800 flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#ff4b4b]"><i className="fas fa-camera-retro mr-2"></i> {v.type} VIEW</span>
                        <span className="text-[10px] font-bold text-slate-400">1024x1024 • PNG</span>
                      </div>
                      <img src={v.url} alt={v.type} className="w-full aspect-square object-cover" />
                    </div>
                  ))}
                </div>
              ) : (
                state.listing && !state.isProcessing && (
                  <div className={`p-10 text-center rounded-2xl border-2 border-dashed ${isDark ? 'border-red-900 bg-red-950/10' : 'border-red-100 bg-red-50/50'}`}>
                    <p className="text-sm font-bold text-red-500 mb-4">Image variants failed to load due to quota exhaustion.</p>
                    <button onClick={() => state.listing && generateImagesOnly(state.listing.title)} className="px-6 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-950 rounded-full font-black text-[10px] uppercase">
                      Retry Image Generation
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
