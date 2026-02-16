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

  const checkKeyStatus = async () => {
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
    checkKeyStatus();
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
      // Optimistically set to true to handle race condition
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
    setState(prev => ({ ...prev, isProcessing: true, statusMessage: '🎨 Rendering variant gallery...', error: null }));
    try {
      const variantTypes: ('Studio' | 'Lifestyle' | 'Contextual')[] = ['Studio', 'Lifestyle', 'Contextual'];
      const primaryImage = state.originalImages[0];
      
      // Parallel generation for speed
      const variantPromises = variantTypes.map(async (type) => {
        try {
          const url = await generateImageVariant(primaryImage, type, listingTitle);
          return { id: Math.random().toString(36).substr(2, 9), url, type, prompt: `Professional ${type} render` } as GeneratedVariant;
        } catch (e: any) { 
          console.warn(`Variant ${type} failed:`, e);
          return null; // Return null so we can still show partial results
        }
      });

      const results = await Promise.all(variantPromises);
      const successful = results.filter((v): v is GeneratedVariant => v !== null);
      
      if (successful.length === 0) {
        throw new Error("Model capacity exceeded. Gemini image generation is currently restricted on this key.");
      }

      setState(prev => ({ ...prev, variants: successful, isProcessing: false, statusMessage: '✅ Gallery ready' }));
    } catch (err: any) {
      let msg = err.message || "Rendering failed";
      
      if (msg.includes("503") || msg.includes("high demand")) {
        msg = "High Demand Error (503). The image generation model is currently overloaded. Please wait 1-2 minutes.";
      } else if (msg.includes("429") || msg.includes("quota")) {
        msg = "Quota Exceeded. Please switch to your personal Gemini API key in the sidebar for priority rendering.";
      }

      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
    }
  };

  const runPipeline = async () => {
    if (state.originalImages.length === 0) {
      setState(prev => ({ ...prev, error: "Please upload a product photo first." }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, statusMessage: `🤖 Analyzing product details...`, error: null, variants: [], listing: null }));

    try {
      const listing = await generateProfessionalListing(state.originalImages, state.rawDescription);
      setState(prev => ({ ...prev, listing }));
      await generateImagesOnly(listing.title);
    } catch (err: any) {
      console.error("Pipeline failure:", err);
      let msg = err.message || "The request failed.";
      
      if (msg.includes("503")) msg = "Service Overloaded. Please try again in a few moments.";
      else if (msg.includes("429")) msg = "Rate limit hit. Use a personal key to bypass this.";
      else if (msg.includes("API key not valid")) msg = "Invalid API Key detected. Ensure you are using a Gemini key (AIzaSy...), not an OpenAI key.";
      
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
    }
  };

  return (
    <div className={`flex min-h-screen font-sans transition-all duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#f8fafc] text-slate-900'}`}>
      
      {/* Enhanced Sidebar */}
      <aside className={`w-[360px] p-8 flex flex-col gap-6 border-r sticky top-0 h-screen overflow-y-auto z-40 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xl'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff4b4b] p-2 rounded-xl shadow-lg"><i className="fas fa-bolt text-white text-xl"></i></div>
            <h1 className="text-xl font-black uppercase tracking-tighter">ProductPro</h1>
          </div>
          <button onClick={() => setIsDark(!isDark)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <i className={`fas ${isDark ? 'fa-sun text-amber-400' : 'fa-moon text-slate-500'}`}></i>
          </button>
        </div>

        {/* Improved API Key Management Card */}
        <div className={`p-5 rounded-2xl border-2 transition-all ${hasPersonalKey ? 'border-green-500 bg-green-50/10' : 'border-blue-500/30 bg-blue-50/10'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 ${hasPersonalKey ? 'text-green-500' : 'text-blue-500'}`}>
              <i className="fas fa-shield-halved"></i>
              {hasPersonalKey ? 'Personal' : 'Shared'} Pipeline
            </span>
            <button onClick={handleSelectKey} className="text-[10px] font-bold px-3 py-1 bg-[#ff4b4b] text-white rounded-full hover:bg-red-600 uppercase shadow-md transition-all active:scale-95">
              Connect Key
            </button>
          </div>
          <p className="text-[11px] opacity-70 leading-relaxed font-medium">
            {hasPersonalKey 
              ? "Running on priority billing. High limits enabled for fast generation." 
              : "Running on community quota. Images might fail during peak hours."}
          </p>
        </div>

        <section className="space-y-6">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-3">Upload Product Photos</label>
            <div className={`p-4 border-2 border-dashed rounded-2xl transition-all group ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200 hover:border-[#ff4b4b]'}`}>
              <div className="relative">
                <input type="file" accept="image/*" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                <div className="flex flex-col items-center py-3 text-slate-400 group-hover:text-[#ff4b4b] transition-colors">
                  <i className="fas fa-camera text-2xl mb-2"></i>
                  <span className="text-[10px] font-black uppercase">Click or Drag Image</span>
                </div>
              </div>
              {state.originalImages.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {state.originalImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square group/img">
                      <img src={img} className="w-full h-full object-cover rounded-xl border-2 border-transparent group-hover/img:border-[#ff4b4b] transition-all shadow-sm" alt="Preview" />
                      <button onClick={() => setState(p => ({ ...p, originalImages: p.originalImages.filter((_, i) => i !== idx) }))} className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full text-[9px] flex items-center justify-center shadow-lg opacity-0 group-hover/img:opacity-100 transition-opacity"><i className="fas fa-times"></i></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Notes / Description</label>
              <button onClick={toggleListening} className={`text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-2 transition-all shadow-sm ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>
                <i className={`fas ${isListening ? 'fa-stop' : 'fa-microphone'}`}></i> {isListening ? 'Recording' : 'Voice'}
              </button>
            </div>
            <textarea value={state.rawDescription} onChange={(e) => setState(p => ({ ...p, rawDescription: e.target.value }))} placeholder="Key features, brand name, specific color..." className={`w-full h-32 p-4 rounded-2xl border-2 text-sm focus:border-[#ff4b4b] outline-none transition-all resize-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-100'}`} />
          </div>
        </section>

        <div className="mt-auto space-y-4 pt-6 border-t dark:border-slate-800">
          <button onClick={runPipeline} disabled={state.isProcessing} className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-red-500/10 transform ${state.isProcessing ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-[#ff4b4b] text-white hover:bg-red-600 active:scale-95 hover:-translate-y-0.5'}`}>
            {state.isProcessing ? <><i className="fas fa-circle-notch fa-spin mr-3"></i> Running Pipeline</> : '🚀 Start Generation'}
          </button>

          {state.error && (
            <div className={`p-4 rounded-2xl border-2 border-red-500/30 animate-in fade-in slide-in-from-top-2 text-[11px] font-bold leading-relaxed shadow-lg ${isDark ? 'bg-red-950/20 text-red-400' : 'bg-red-50 text-red-700'}`}>
              <div className="flex gap-3 mb-4">
                <i className="fas fa-warning text-base mt-0.5"></i>
                <span>{state.error}</span>
              </div>
              <button onClick={handleSelectKey} className="w-full py-3 bg-[#ff4b4b] text-white rounded-xl hover:bg-red-600 uppercase text-[10px] font-black shadow-md transition-all">
                Switch to Personal Key
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 px-12 py-16 overflow-y-auto scroll-smooth">
        <div className="max-w-[900px] mx-auto">
          <div className="mb-10">
            <span className="text-[11px] font-bold text-red-500 uppercase tracking-[0.3em] block mb-2">Marketplace Asset Engine</span>
            <StHeader isDark={isDark}>E-commerce Content Pipeline</StHeader>
          </div>
          
          {state.isProcessing && (
            <div className="mb-12 animate-in fade-in duration-500">
              <StInfo isDark={isDark}>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-10 h-10 border-4 border-red-500/20 rounded-full animate-spin"></div>
                    <div className="w-10 h-10 border-t-4 border-red-500 rounded-full absolute inset-0 animate-spin"></div>
                  </div>
                  <span className="text-base font-bold tracking-tight">{state.statusMessage}</span>
                </div>
              </StInfo>
            </div>
          )}

          {!state.listing && !state.isProcessing && (
            <div className={`p-32 text-center rounded-[3rem] border-4 border-dashed transition-all flex flex-col items-center justify-center gap-6 ${isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-white shadow-inner'}`}>
              <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-700">
                <i className="fas fa-magic text-5xl"></i>
              </div>
              <div>
                <p className="font-black text-2xl uppercase tracking-tighter opacity-30">Awaiting Product Input</p>
                <p className="text-sm opacity-20 mt-2">Upload a photo to begin high-speed generation.</p>
              </div>
            </div>
          )}

          {state.listing && (
            <div className="space-y-16 animate-in fade-in slide-in-from-bottom-12 duration-1000">
              {/* Product Info Section */}
              <section className={`p-12 rounded-[3.5rem] shadow-2xl border transition-all ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                <div className="flex justify-between items-start mb-12 border-b dark:border-slate-800 pb-10">
                  <div className="flex-1 pr-12">
                    <span className="text-[10px] font-black text-[#ff4b4b] uppercase tracking-[0.3em] block mb-2">Optimized Catalog Title</span>
                    <h2 className={`text-4xl font-black leading-none tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>{state.listing.title}</h2>
                  </div>
                  <div className="shrink-0"><StSuccess isDark={isDark}>Verified SEO</StSuccess></div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-5 gap-16">
                  <div className="md:col-span-3 space-y-10">
                    <div>
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-3">
                        <i className="fas fa-pen-nib"></i> Product Narrative
                      </h3>
                      <p className={`text-xl leading-relaxed italic font-medium p-10 rounded-[2.5rem] border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700 shadow-inner'}`}>
                        "{state.listing.description}"
                      </p>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-3">
                        <i className="fas fa-list-check"></i> High-Impact Features
                      </h3>
                      <div className="grid grid-cols-1 gap-3">
                        {state.listing.keyFeatures.map((f, i) => (
                          <div key={i} className="flex items-center gap-4 text-sm font-bold bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-transparent hover:border-[#ff4b4b] transition-all">
                            <i className="fas fa-circle-check text-green-500"></i>
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="md:col-span-2 space-y-10">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-3">
                      <i className="fas fa-microchip"></i> Specifications
                    </h3>
                    <div className="flex flex-col gap-4">
                      {state.listing.specifications.map((s, i) => (
                        <div key={i} className={`p-5 border rounded-2xl flex justify-between items-center transition-transform hover:scale-[1.03] ${isDark ? 'border-slate-800 bg-slate-950/50 shadow-lg' : 'border-slate-100 bg-white shadow-md'}`}>
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{s.key}</span>
                          <span className="text-xs font-black truncate max-w-[140px]">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Renders Section */}
              <section className="pt-16 border-t-4 dark:border-slate-800 space-y-16 pb-32">
                <div className="flex justify-between items-end">
                  <div>
                    <h3 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-5">
                      <i className="fas fa-images text-[#ff4b4b] text-4xl"></i>
                      HD Render Gallery
                    </h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase mt-2 tracking-widest">Parallel Image Pipeline (1024x1024)</p>
                  </div>
                </div>

                {state.variants.length > 0 ? (
                  <div className="grid grid-cols-1 gap-24">
                    {state.variants.map((v) => (
                      <div key={v.id} className="rounded-[4rem] overflow-hidden shadow-2xl border dark:border-slate-800 group relative bg-black/5 animate-in zoom-in-95 duration-700">
                        <div className="absolute top-10 right-10 z-20 opacity-0 group-hover:opacity-100 transition-all transform translate-y-6 group-hover:translate-y-0">
                          <button onClick={() => { const a = document.createElement('a'); a.href = v.url; a.download = `${v.type}-view.png`; a.click(); }} className="bg-white/90 backdrop-blur-xl px-10 py-5 rounded-full text-[13px] font-black text-slate-900 shadow-2xl flex items-center gap-4 hover:bg-[#ff4b4b] hover:text-white transition-all transform active:scale-95">
                            <i className="fas fa-cloud-arrow-down text-lg"></i> EXPORT HD ASSET
                          </button>
                        </div>
                        <div className="p-10 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md border-b dark:border-slate-800 flex justify-between items-center px-16 relative z-10">
                          <div className="flex items-center gap-6">
                            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 text-xl">
                              <i className={`fas ${v.type === 'Studio' ? 'fa-building' : v.type === 'Lifestyle' ? 'fa-couch' : 'fa-hand-holding'}`}></i>
                            </div>
                            <div>
                               <span className="text-[13px] font-black uppercase tracking-[0.4em] text-red-500 block leading-none mb-1">{v.type} PERSPECTIVE</span>
                               <span className="text-[10px] font-bold text-slate-400 uppercase">AI Synced Render Engine</span>
                            </div>
                          </div>
                          <span className="text-[11px] font-black text-slate-500 bg-white/50 dark:bg-slate-800/50 px-4 py-2 rounded-xl border border-current/10 uppercase tracking-tighter">HD PNG • 1:1</span>
                        </div>
                        <div className="aspect-square bg-slate-100 dark:bg-[#111] relative overflow-hidden">
                           <img src={v.url} alt={v.type} className="w-full h-full object-cover transition-transform duration-[2000ms] group-hover:scale-110 ease-out" />
                        </div>
                        <div className="p-8 bg-slate-50 dark:bg-slate-950 text-[10px] font-bold opacity-30 italic px-16 border-t dark:border-slate-800 tracking-widest uppercase">
                          Prompt: {v.prompt}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  !state.isProcessing && (
                    <div className={`p-24 text-center rounded-[3.5rem] border-4 border-dashed transition-all transform hover:scale-[1.01] ${isDark ? 'border-red-900/30 bg-red-950/10' : 'border-red-100 bg-red-50/50'}`}>
                      <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-8 text-red-500">
                        <i className="fas fa-cloud-slash text-4xl"></i>
                      </div>
                      <h4 className="text-2xl font-black text-red-500 mb-3 uppercase tracking-tight">Renders Restricted</h4>
                      <p className="text-base font-medium opacity-60 mb-10 max-w-lg mx-auto leading-relaxed">The image generation service is currently unavailable for this key. This is usually due to shared quota limits.</p>
                      <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button onClick={() => state.listing && generateImagesOnly(state.listing.title)} className="px-12 py-5 bg-[#ff4b4b] text-white rounded-2xl font-black text-xs uppercase shadow-2xl hover:bg-red-600 transition-all hover:-translate-y-1 active:scale-95">
                          <i className="fas fa-rotate mr-3"></i> Retry Render Pipeline
                        </button>
                        <button onClick={handleSelectKey} className="px-12 py-5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-slate-50 transition-all border dark:border-slate-700 active:scale-95">
                          <i className="fas fa-key mr-3 text-[#ff4b4b]"></i> Connect Personal Key
                        </button>
                      </div>
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
          100% { transform: translateX(100%); }
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ff4b4b22; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #ff4b4b44; }
      `}</style>
    </div>
  );
};

export default App;