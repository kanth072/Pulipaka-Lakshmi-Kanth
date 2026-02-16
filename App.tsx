
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

  const [hasPersonalKey, setHasPersonalKey] = useState<boolean | null>(null);
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

  const checkKey = async () => {
    if ((window as any).aistudio?.hasSelectedApiKey) {
      try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey() as boolean;
        setHasPersonalKey(hasKey);
      } catch (e) {
        setHasPersonalKey(false);
      }
    } else {
      setHasPersonalKey(false);
    }
  };

  useEffect(() => {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileList = Array.from(files);
    const readPromises = fileList.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file as Blob);
      });
    });

    Promise.all(readPromises).then(base64Images => {
      setState(prev => ({ ...prev, originalImages: [...prev.originalImages, ...base64Images] }));
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
        } catch (e: any) { 
          if (e.message?.includes("Requested entity was not found")) {
             setHasPersonalKey(false);
          }
          console.warn(`Variant ${type} failed:`, e);
          throw e; // Propagate to catch block for overall handling
        }
      });

      const results = await Promise.all(variantPromises);
      const successful = results.filter((v): v is GeneratedVariant => v !== null);
      
      if (successful.length === 0) throw new Error("Image generation failed.");

      setState(prev => ({ ...prev, variants: successful, isProcessing: false, statusMessage: '✅ Complete' }));
    } catch (err: any) {
      let msg = err.message || "Image generation failed";
      
      if (msg.includes("503") || msg.includes("high demand")) {
        msg = "The image model is currently facing high demand. Please try again in a few minutes.";
      } else if (msg.includes("429") || msg.includes("quota")) {
        msg = "Image Quota Exceeded. Using a personal API key is recommended for high-volume generation.";
      }

      if (msg.includes("Requested entity was not found")) {
        setHasPersonalKey(false);
      }
      
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
    }
  };

  const runPipeline = async () => {
    if (state.originalImages.length === 0) {
      setState(prev => ({ ...prev, error: "Please upload at least one product photo." }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, statusMessage: `🤖 Analyzing photos...`, error: null, variants: [], listing: null }));

    try {
      const listing = await generateProfessionalListing(state.originalImages, state.rawDescription);
      setState(prev => ({ ...prev, listing }));
      await generateImagesOnly(listing.title);
    } catch (err: any) {
      console.error("Pipeline Error:", err);
      let msg = err.message || "Processing failed";
      
      if (msg.includes("503") || msg.includes("high demand")) {
        msg = "The AI service is currently overloaded. This is usually temporary. Please wait a moment and try again.";
      } else if (msg.includes("429") || msg.includes("quota")) {
        msg = "API Quota Exceeded. Shared capacity is limited. Please connect your own Gemini key.";
      }
      
      if (msg.includes("Requested entity was not found")) {
        setHasPersonalKey(false);
      }
      
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
    }
  };

  return (
    <div className={`flex min-h-screen font-sans transition-colors duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#f8fafc] text-slate-900'}`}>
      
      {/* Sidebar */}
      <aside className={`w-[360px] p-8 flex flex-col gap-6 border-r transition-all z-30 sticky top-0 h-screen overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800 shadow-2xl' : 'bg-white border-slate-200 shadow-xl'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff4b4b] p-2 rounded-lg shadow-lg shadow-red-500/20"><i className="fas fa-bolt text-white text-xl"></i></div>
            <h1 className="text-xl font-black uppercase tracking-tighter">ProductPro</h1>
          </div>
          <button onClick={() => setIsDark(!isDark)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <i className={`fas ${isDark ? 'fa-sun text-amber-400' : 'fa-moon text-slate-500'}`}></i>
          </button>
        </div>

        {/* API Key Status - Fixed and Always Visible */}
        <div className={`p-5 rounded-2xl border-2 transition-all ${hasPersonalKey ? (isDark ? 'bg-green-950/20 border-green-500/30' : 'bg-green-50 border-green-200') : (isDark ? 'bg-blue-950/20 border-blue-500/30' : 'bg-blue-50 border-blue-200')}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-2 ${hasPersonalKey ? 'text-green-500' : 'text-blue-500'}`}>
              <span className={`w-2 h-2 rounded-full animate-pulse ${hasPersonalKey ? 'bg-green-500' : 'bg-blue-500'}`}></span>
              {hasPersonalKey ? 'Personal Key' : 'Shared Capacity'}
            </span>
            <button onClick={handleSelectKey} className="text-[10px] font-black text-slate-900 dark:text-white bg-white/20 hover:bg-white/40 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1 rounded-full border border-current/10 transition-all uppercase">
              {hasPersonalKey ? 'Switch' : 'Connect'}
            </button>
          </div>
          <p className={`text-[11px] font-bold leading-tight opacity-70 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            {hasPersonalKey 
              ? "Running on your personal billing account. Higher limits enabled." 
              : "Using shared resources. Capacity may be limited during high demand."}
          </p>
          {!hasPersonalKey && (
            <a href="https://ai.google.dev/" target="_blank" rel="noreferrer" className="text-[10px] font-black text-blue-500 underline mt-2 block uppercase tracking-tighter">
              Get free API key <i className="fas fa-external-link-alt ml-1"></i>
            </a>
          )}
        </div>

        <section className="space-y-6">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-3">Product Visuals</label>
            <div className={`p-4 border-2 border-dashed rounded-2xl transition-all group ${isDark ? 'bg-slate-800 border-slate-700 hover:border-[#ff4b4b]' : 'bg-slate-50 border-slate-200 hover:border-[#ff4b4b]'}`}>
              <div className="relative">
                <input type="file" accept="image/*" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                <div className="flex flex-col items-center py-2 text-slate-400 group-hover:text-[#ff4b4b] transition-colors">
                  <i className="fas fa-cloud-upload-alt text-2xl mb-2"></i>
                  <span className="text-[10px] font-black uppercase">Choose Photos</span>
                </div>
              </div>
              {state.originalImages.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                  {state.originalImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square group/img">
                      <img src={img} className="w-full h-full object-cover rounded-lg border shadow-sm" alt="Thumbnail" />
                      <button onClick={() => setState(p => ({ ...p, originalImages: p.originalImages.filter((_, i) => i !== idx) }))} className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full text-[9px] flex items-center justify-center shadow-lg opacity-0 group-hover/img:opacity-100 transition-opacity"><i className="fas fa-times"></i></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Prompt / Description</label>
              <button onClick={toggleListening} className={`text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-2 transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                <i className={`fas ${isListening ? 'fa-stop' : 'fa-microphone'}`}></i> {isListening ? 'LISTENING' : 'VOICE'}
              </button>
            </div>
            <textarea value={state.rawDescription} onChange={(e) => setState(p => ({ ...p, rawDescription: e.target.value }))} placeholder="Mention color, brand, or key selling points..." className={`w-full h-32 p-4 rounded-2xl border-2 text-sm focus:border-[#ff4b4b] outline-none transition-all resize-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-100 shadow-inner'}`} />
          </div>
        </section>

        <div className="mt-auto space-y-4 pt-4">
          <button onClick={runPipeline} disabled={state.isProcessing} className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all shadow-xl shadow-red-500/20 transform ${state.isProcessing ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-[#ff4b4b] text-white hover:bg-red-600 active:scale-95'}`}>
            {state.isProcessing ? <><i className="fas fa-cog fa-spin mr-3"></i> Running</> : '🚀 Start Pipeline'}
          </button>

          {state.error && (
            <div className={`p-5 rounded-2xl border-2 animate-in fade-in slide-in-from-top-2 text-[11px] font-bold leading-relaxed shadow-xl ${isDark ? 'bg-red-950/30 border-red-500/30 text-red-400' : 'bg-red-50 border-red-200 text-red-700'}`}>
              <div className="flex gap-3 mb-4">
                <i className="fas fa-exclamation-circle text-base shrink-0"></i>
                <span>{state.error}</span>
              </div>
              {(state.error.includes("Quota") || state.error.includes("overloaded") || state.error.includes("demand")) && (
                <button onClick={handleSelectKey} className="w-full py-3 bg-[#ff4b4b] text-white rounded-xl hover:bg-red-600 uppercase text-[10px] font-black shadow-md transition-all active:scale-95">
                  Use Personal Key for Reliable Access
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 px-12 py-16 overflow-y-auto z-10 relative scroll-smooth bg-gradient-to-br from-transparent to-slate-100/30 dark:to-slate-900/10">
        <div className="max-w-[900px] mx-auto">
          <div className="flex items-center gap-4 mb-2">
            <span className="px-3 py-1 rounded-full bg-red-500 text-white text-[9px] font-black uppercase tracking-widest">v1.6 Stable</span>
            <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>AI-POWERED ASSET PRODUCTION</span>
          </div>
          <StHeader isDark={isDark}>Asset Pipeline Result</StHeader>
          
          {state.isProcessing && (
            <div className="mb-8">
              <StInfo isDark={isDark}>
                <div className="flex items-center gap-4">
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>{state.statusMessage}</span>
                </div>
              </StInfo>
              <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-4">
                <div className="h-full bg-red-500 animate-[loading_2s_ease-in-out_infinite]" style={{ width: '40%' }}></div>
              </div>
            </div>
          )}

          {!state.listing && !state.isProcessing && (
            <div className={`p-32 text-center rounded-[3rem] border-2 border-dashed transition-all transform hover:scale-[1.01] ${isDark ? 'border-slate-800 bg-slate-900/50 text-slate-600' : 'border-slate-200 bg-white text-slate-300'}`}>
              <div className="mb-8"><i className="fas fa-magic text-7xl opacity-20"></i></div>
              <p className="font-black text-2xl tracking-tight uppercase opacity-50 mb-2">System Ready</p>
              <p className="text-sm opacity-40">Upload a photo to generate catalog assets instantly.</p>
            </div>
          )}

          {state.listing && (
            <div className="space-y-16 animate-in fade-in slide-in-from-bottom-10 duration-700 ease-out">
              <section className={`p-12 rounded-[3rem] shadow-2xl border transition-all ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                <div className="flex justify-between items-start mb-10 border-b dark:border-slate-800 pb-8">
                  <div>
                    <span className="text-[10px] font-black text-[#ff4b4b] uppercase tracking-[0.3em] block mb-2">Catalog Metadata</span>
                    <h2 className={`text-3xl font-black leading-tight tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>{state.listing.title}</h2>
                  </div>
                  <div className="shrink-0"><StSuccess isDark={isDark}>AI Optimized</StSuccess></div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-5 gap-12">
                  <div className="md:col-span-3 space-y-8">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <i className="fas fa-align-left"></i> Product Narrative
                    </h3>
                    <p className={`text-xl leading-relaxed italic font-medium p-8 rounded-[2rem] border transition-all ${isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700 shadow-inner'}`}>
                      "{state.listing.description}"
                    </p>
                    <div className="space-y-4">
                       <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 pt-4">
                        <i className="fas fa-star"></i> Key Selling Points
                      </h3>
                      <ul className="space-y-3">
                        {state.listing.keyFeatures.map((f, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm font-bold opacity-80">
                            <i className="fas fa-check-circle text-green-500 mt-1"></i>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  <div className="md:col-span-2 space-y-8">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <i className="fas fa-list-ul"></i> Specifications
                    </h3>
                    <div className="flex flex-col gap-3">
                      {state.listing.specifications.map((s, i) => (
                        <div key={i} className={`p-4 border rounded-2xl flex justify-between items-center transition-all hover:scale-[1.02] ${isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-100 bg-slate-50'}`}>
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{s.key}</span>
                          <span className="text-xs font-black truncate max-w-[120px]">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="pt-12 border-t-2 dark:border-slate-800 space-y-12 pb-20">
                <div className="flex justify-between items-end">
                  <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-4">
                    <i className="fas fa-camera-retro text-[#ff4b4b] text-3xl"></i>
                    HD Render Gallery
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">3 Unique Perspectivies Generated</p>
                </div>

                {state.variants.length > 0 ? (
                  <div className="grid grid-cols-1 gap-20">
                    {state.variants.map((v) => (
                      <div key={v.id} className="rounded-[3rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] border dark:border-slate-800 group relative bg-black/5 animate-in zoom-in-95 duration-500">
                        <div className="absolute top-8 right-8 z-10 opacity-0 group-hover:opacity-100 transition-all transform translate-y-4 group-hover:translate-y-0 duration-300">
                          <button onClick={() => { const a = document.createElement('a'); a.href = v.url; a.download = `${v.type}.png`; a.click(); }} className="bg-white px-8 py-4 rounded-full text-[12px] font-black text-slate-900 shadow-2xl flex items-center gap-3 hover:bg-[#ff4b4b] hover:text-white transition-all active:scale-95">
                            <i className="fas fa-file-download text-base"></i> EXPORT HD ASSET
                          </button>
                        </div>
                        <div className="p-8 bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md border-b dark:border-slate-800 flex justify-between items-center px-12">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 font-black text-xs">
                              {v.type[0]}
                            </div>
                            <div>
                               <span className="text-[12px] font-black uppercase tracking-[0.25em] text-red-500 block leading-none">{v.type} VIEW</span>
                               <span className="text-[9px] font-bold text-slate-400 mt-1 block">CALIBRATED COMPOSITION</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-current/10">1024 PX • PNG</span>
                        </div>
                        <div className="aspect-square overflow-hidden bg-[#111]">
                           <img src={v.url} alt={v.type} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
                        </div>
                        <div className="p-6 bg-white dark:bg-slate-900 text-[10px] font-medium opacity-40 italic px-12 border-t dark:border-slate-800">
                          {v.prompt}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  !state.isProcessing && (
                    <div className={`p-20 text-center rounded-[3rem] border-2 border-dashed transition-all ${isDark ? 'border-red-900 bg-red-950/10' : 'border-red-100 bg-red-50/50'}`}>
                      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                        <i className="fas fa-exclamation-triangle text-3xl"></i>
                      </div>
                      <p className="text-xl font-black text-red-500 mb-2 uppercase tracking-tight">Renders Unavailable</p>
                      <p className="text-sm opacity-60 mb-8 max-w-md mx-auto">This usually happens due to temporary high demand on the shared generation model. Please wait and retry.</p>
                      <button onClick={() => state.listing && generateImagesOnly(state.listing.title)} className="px-10 py-4 bg-[#ff4b4b] text-white rounded-2xl font-black text-[11px] uppercase shadow-xl hover:bg-red-600 transition-all hover:-translate-y-1 active:scale-95">
                        <i className="fas fa-sync-alt mr-2"></i> Attempt Re-Render
                      </button>
                    </div>
                  )
                )}
              </section>
            </div>
          )}
        </div>
      </main>
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ff4b4b44;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #ff4b4b88;
        }
      `}</style>
    </div>
  );
};

export default App;
