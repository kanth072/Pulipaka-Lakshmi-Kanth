
import React, { useState, useEffect, useRef } from 'react';
import { AppState, GeneratedVariant, ProductListing } from './types';
import { generateProfessionalListing, generateImageVariant } from './services/geminiService';

// --- Streamlit-inspired UI Elements ---

// Fix: Making children optional to resolve TypeScript "missing children" errors during component usage
const Badge = ({ children, color = 'red' }: { children?: React.ReactNode, color?: 'red' | 'blue' | 'green' | 'amber' }) => {
  const colors = {
    red: 'bg-red-500/10 text-red-500',
    blue: 'bg-blue-500/10 text-blue-500',
    green: 'bg-green-500/10 text-green-500',
    amber: 'bg-amber-500/10 text-amber-500'
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${colors[color]}`}>
      {children}
    </span>
  );
};

// Fix: Making children optional to resolve TypeScript "missing children" errors during component usage
const StCard = ({ children, isDark, title }: { children?: React.ReactNode, isDark: boolean, title?: string }) => (
  <div className={`p-8 rounded-3xl border shadow-sm transition-all ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
    {title && <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
      <div className="w-1 h-3 bg-red-500 rounded-full" /> {title}
    </h3>}
    {children}
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
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
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
    setState(prev => ({ ...prev, isProcessing: true, statusMessage: '🎨 Running Parallel Render Engine...', error: null }));
    try {
      const variantTypes: ('Studio' | 'Lifestyle' | 'Contextual')[] = ['Studio', 'Lifestyle', 'Contextual'];
      const primaryImage = state.originalImages[0];
      
      const variantPromises = variantTypes.map(async (type) => {
        try {
          const url = await generateImageVariant(primaryImage, type, listingTitle);
          return { id: Math.random().toString(36).substr(2, 9), url, type, prompt: `Professional ${type} composition` } as GeneratedVariant;
        } catch (e: any) { 
          console.warn(`Variant ${type} failed:`, e);
          return null;
        }
      });

      const results = await Promise.all(variantPromises);
      const successful = results.filter((v): v is GeneratedVariant => v !== null);
      
      if (successful.length === 0) {
        throw new Error("Render Quota Exceeded. The Gemini Image model is at capacity for this key. Please use a Personal Key with billing enabled.");
      }

      setState(prev => ({ ...prev, variants: successful, isProcessing: false, statusMessage: '✅ Pipeline Complete' }));
    } catch (err: any) {
      let msg = err.message || "Rendering Restricted";
      if (msg.includes("Quota") || msg.includes("429")) msg = "Render Quota Exhausted. High-speed rendering requires a Personal Gemini API Key with billing active.";
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
    }
  };

  const runPipeline = async () => {
    if (state.originalImages.length === 0) {
      setState(prev => ({ ...prev, error: "Upload a product photo to activate pipeline." }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, statusMessage: `🤖 AI Analyzing product visuals...`, error: null, variants: [], listing: null }));

    try {
      const listing = await generateProfessionalListing(state.originalImages, state.rawDescription);
      setState(prev => ({ ...prev, listing }));
      await generateImagesOnly(listing.title);
    } catch (err: any) {
      console.error("Pipeline failure:", err);
      let msg = err.message || "Asset Engine Error";
      
      if (msg.includes("sk-") || msg.includes("API key not valid")) {
        msg = "Incompatible API Key. You are using an OpenAI key (sk-...). This app is optimized for Google Gemini. Please get a free Gemini key from AI Studio (AIzaSy...).";
      } else if (msg.includes("429")) {
        msg = "Quota Limit Hit. The shared pipeline is overloaded. Connect a Personal Key for high-speed, reliable production.";
      }
      
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
    }
  };

  return (
    <div className={`flex min-h-screen font-sans transition-all duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#fcfdfe] text-slate-900'}`}>
      
      {/* SIDEBAR */}
      <aside className={`w-[360px] p-8 flex flex-col gap-6 border-r sticky top-0 h-screen overflow-y-auto z-40 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xl shadow-slate-200/50'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff4b4b] p-2 rounded-xl shadow-lg shadow-red-500/20"><i className="fas fa-bolt text-white text-xl"></i></div>
            <h1 className="text-xl font-black uppercase tracking-tighter">ProductPro</h1>
          </div>
          <button onClick={() => setIsDark(!isDark)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <i className={`fas ${isDark ? 'fa-sun text-amber-400' : 'fa-moon text-slate-500'}`}></i>
          </button>
        </div>

        {/* API KEY STATUS */}
        <div className={`p-5 rounded-2xl border-2 transition-all ${hasPersonalKey ? 'border-green-500 bg-green-50/10' : 'border-blue-500/30 bg-blue-50/10'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${hasPersonalKey ? 'bg-green-500' : 'bg-blue-500'}`} />
              <span className={`text-[11px] font-black uppercase tracking-widest ${hasPersonalKey ? 'text-green-500' : 'text-blue-500'}`}>
                {hasPersonalKey ? 'Priority Access' : 'Shared Pipeline'}
              </span>
            </div>
            <button onClick={handleSelectKey} className="text-[10px] font-bold px-3 py-1 bg-[#ff4b4b] text-white rounded-full hover:bg-red-600 transition-all uppercase">
              {hasPersonalKey ? 'Change' : 'Connect'}
            </button>
          </div>
          <p className="text-[11px] opacity-70 leading-relaxed font-medium mb-3">
            {hasPersonalKey 
              ? "Your Gemini key is active. Full performance enabled." 
              : "Using shared resources. Capacity restricted at peak times."}
          </p>
          <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-[10px] font-black text-blue-500 hover:underline flex items-center gap-1">
            GET GEMINI KEY <i className="fas fa-external-link-alt text-[8px]"></i>
          </a>
        </div>

        <div className="space-y-8 mt-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 flex justify-between">
              Product Visuals <span className="text-red-500">Required</span>
            </label>
            <div className={`p-6 border-2 border-dashed rounded-3xl transition-all group flex flex-col items-center justify-center gap-3 cursor-pointer ${isDark ? 'bg-slate-800 border-slate-700 hover:border-red-500' : 'bg-slate-50 border-slate-200 hover:border-red-500'}`}>
              <div className="relative w-full text-center">
                <input type="file" accept="image/*" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                <i className="fas fa-cloud-upload-alt text-3xl text-slate-300 group-hover:text-red-500 transition-colors"></i>
                <p className="text-[10px] font-black uppercase mt-2 tracking-tighter text-slate-500">Click to upload assets</p>
              </div>
              {state.originalImages.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2 w-full">
                  {state.originalImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square group/img">
                      <img src={img} className="w-full h-full object-cover rounded-xl shadow-sm border dark:border-slate-700" alt="Preview" />
                      <button onClick={() => setState(p => ({ ...p, originalImages: p.originalImages.filter((_, i) => i !== idx) }))} className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full text-[9px] flex items-center justify-center shadow-lg"><i className="fas fa-times"></i></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Notes & Specs</label>
              <button onClick={toggleListening} className={`text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-2 transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>
                <i className={`fas ${isListening ? 'fa-microphone' : 'fa-microphone'}`}></i> {isListening ? 'STOP' : 'DICTATE'}
              </button>
            </div>
            <textarea value={state.rawDescription} onChange={(e) => setState(p => ({ ...p, rawDescription: e.target.value }))} placeholder="Key features, brand name, specific color..." className={`w-full h-36 p-5 rounded-3xl border-2 text-sm focus:border-red-500 outline-none transition-all resize-none shadow-inner ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50/50 border-slate-100'}`} />
          </div>
        </div>

        <div className="mt-auto pt-6 border-t dark:border-slate-800">
          <button onClick={runPipeline} disabled={state.isProcessing} className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl transform ${state.isProcessing ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-[#ff4b4b] text-white hover:bg-red-600 active:scale-95 shadow-red-500/20'}`}>
            {state.isProcessing ? <><i className="fas fa-circle-notch fa-spin mr-3"></i> Syncing Engine</> : '🚀 Execute Pipeline'}
          </button>

          {state.error && (
            <div className={`mt-6 p-5 rounded-2xl border-2 border-red-500/30 text-[11px] font-bold leading-relaxed shadow-xl animate-in slide-in-from-top-2 ${isDark ? 'bg-red-950/20 text-red-400' : 'bg-red-50 text-red-700'}`}>
              <div className="flex gap-3 items-start">
                <i className="fas fa-exclamation-triangle text-base mt-0.5"></i>
                <div className="space-y-3">
                  <p>{state.error}</p>
                  {state.error.includes("sk-") && (
                    <div className="p-3 bg-white/10 rounded-xl font-normal text-[10px]">
                      <strong>Notice:</strong> Your key starts with <code className="bg-red-500 text-white px-1">sk-</code> which is for <strong>OpenAI</strong>. This application requires a <strong>Google Gemini</strong> key.
                    </div>
                  )}
                  <button onClick={handleSelectKey} className="w-full py-2 bg-red-500 text-white rounded-xl uppercase text-[10px] font-black hover:bg-red-600">Connect Google Gemini Key</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN PANEL */}
      <main className="flex-1 px-16 py-16 overflow-y-auto scroll-smooth">
        <div className="max-w-[1000px] mx-auto">
          <div className="mb-12 flex justify-between items-end">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Badge color="red">V2.0 STABLE</Badge>
                <Badge color="blue">HD RENDERING</Badge>
              </div>
              <h1 className={`text-4xl font-black tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>Asset Production Workspace</h1>
            </div>
            {!state.isProcessing && state.listing && <button onClick={() => window.print()} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border shadow-sm hover:scale-105 transition-all"><i className="fas fa-print"></i></button>}
          </div>
          
          {state.isProcessing && (
            <div className="mb-12 animate-in fade-in slide-in-from-top-4">
              <div className={`p-8 rounded-[2rem] border-2 border-red-500/20 flex flex-col gap-6 ${isDark ? 'bg-slate-900/50' : 'bg-white'}`}>
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin"></div>
                      <span className="text-xl font-black tracking-tight">{state.statusMessage}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-400 animate-pulse">DO NOT CLOSE TAB</span>
                 </div>
                 <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 animate-[loading_2s_infinite]" style={{ width: '40%' }}></div>
                 </div>
              </div>
            </div>
          )}

          {!state.listing && !state.isProcessing && (
            <div className={`p-40 text-center rounded-[4rem] border-4 border-dashed transition-all flex flex-col items-center justify-center gap-8 ${isDark ? 'border-slate-800 bg-slate-900/30' : 'border-slate-100 bg-white'}`}>
              <div className="w-32 h-32 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-200 dark:text-slate-800 shadow-inner">
                <i className="fas fa-magic text-6xl opacity-30"></i>
              </div>
              <div className="space-y-2">
                <p className="font-black text-3xl uppercase tracking-tighter opacity-20">System Initialized</p>
                <p className="text-sm opacity-10 font-bold uppercase tracking-widest">Upload assets to begin generation pipeline</p>
              </div>
            </div>
          )}

          {state.listing && (
            <div className="space-y-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
              
              <StCard isDark={isDark} title="Catalog Metadata Output">
                <div className="flex justify-between items-start mb-12 border-b dark:border-slate-800 pb-10">
                  <div className="flex-1 pr-16">
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.4em] block mb-3">SEO Optimized Title</span>
                    <h2 className={`text-5xl font-black leading-[1.1] tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>{state.listing.title}</h2>
                  </div>
                  <Badge color="green">Ready for Marketplace</Badge>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-16">
                  <div className="md:col-span-7 space-y-12">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6">Marketing Narrative</h4>
                      <p className={`text-2xl leading-relaxed italic font-medium p-12 rounded-[3rem] border shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                        "{state.listing.description}"
                      </p>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6">High-Conversion Features</h4>
                      <div className="space-y-4">
                        {state.listing.keyFeatures.map((f, i) => (
                          <div key={i} className="flex items-center gap-5 text-lg font-bold p-5 rounded-2xl bg-slate-50/50 dark:bg-slate-950/50 border border-transparent hover:border-red-500/30 transition-all">
                            <i className="fas fa-circle-check text-green-500"></i>
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="md:col-span-5 space-y-12">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6">Technical Data Map</h4>
                    <div className="grid grid-cols-1 gap-4">
                      {state.listing.specifications.map((s, i) => (
                        <div key={i} className={`p-6 border rounded-[2rem] flex justify-between items-center transition-all hover:scale-[1.03] ${isDark ? 'border-slate-800 bg-slate-950 shadow-lg' : 'border-slate-100 bg-white shadow-md'}`}>
                          <span className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">{s.key}</span>
                          <span className="text-sm font-black truncate max-w-[160px]">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </StCard>

              <section className="pt-20 border-t-8 border-slate-100 dark:border-slate-900 space-y-20 pb-40">
                <div className="flex justify-between items-end">
                   <h3 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-6">
                      <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg shadow-red-500/20"><i className="fas fa-camera"></i></div>
                      HD Asset Gallery
                    </h3>
                    <p className="text-[11px] font-black text-slate-400 tracking-widest uppercase mb-2">Parallel Render Pipeline Active</p>
                </div>

                {state.variants.length > 0 ? (
                  <div className="grid grid-cols-1 gap-32">
                    {state.variants.map((v) => (
                      <div key={v.id} className="rounded-[4.5rem] overflow-hidden shadow-2xl border dark:border-slate-800 group relative bg-black/5 animate-in zoom-in-95 duration-700">
                        <div className="absolute top-12 right-12 z-20 opacity-0 group-hover:opacity-100 transition-all transform translate-y-8 group-hover:translate-y-0">
                          <button onClick={() => { const a = document.createElement('a'); a.href = v.url; a.download = `${v.type}.png`; a.click(); }} className="bg-white/95 backdrop-blur-2xl px-12 py-6 rounded-full text-sm font-black text-slate-900 shadow-2xl flex items-center gap-4 hover:bg-red-500 hover:text-white transition-all transform active:scale-95">
                            <i className="fas fa-file-export"></i> EXPORT MASTER ASSET
                          </button>
                        </div>
                        <div className="p-12 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b dark:border-slate-800 flex justify-between items-center px-20 relative z-10">
                          <div className="flex items-center gap-8">
                            <div className="w-16 h-16 rounded-[1.5rem] bg-red-500/10 flex items-center justify-center text-red-500 text-2xl font-black">
                              {v.type[0]}
                            </div>
                            <div>
                               <span className="text-sm font-black uppercase tracking-[0.5em] text-red-500 block leading-none mb-1">{v.type} RENDER</span>
                               <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">High-Definition Compositing</span>
                            </div>
                          </div>
                          <Badge color="blue">1024 PX • LOSSLESS</Badge>
                        </div>
                        <div className="aspect-square bg-slate-50 dark:bg-[#050505] relative overflow-hidden flex items-center justify-center">
                           <img src={v.url} alt={v.type} className="w-full h-full object-cover transition-transform duration-[3000ms] group-hover:scale-105 ease-out" />
                           <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                        </div>
                        <div className="p-10 bg-slate-50 dark:bg-slate-950 text-[10px] font-bold opacity-30 italic px-20 border-t dark:border-slate-800 tracking-widest uppercase">
                          AI Pipeline Path: {v.prompt}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  !state.isProcessing && (
                    <div className={`p-24 text-center rounded-[4rem] border-4 border-dashed transition-all ${isDark ? 'border-red-900/40 bg-red-950/10' : 'border-red-100 bg-red-50/50'}`}>
                      <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-10 text-red-500 shadow-inner">
                        <i className="fas fa-exclamation-circle text-4xl"></i>
                      </div>
                      <h4 className="text-3xl font-black text-red-500 mb-4 uppercase tracking-tighter">Rendering Restricted</h4>
                      <p className="text-lg font-medium opacity-60 mb-12 max-w-xl mx-auto leading-relaxed">Your Gemini API key has exceeded its monthly quota for image generation. To continue high-speed asset production, please enable billing in Google Cloud Console or connect a Priority Key.</p>
                      <div className="flex flex-col sm:flex-row gap-6 justify-center">
                        <button onClick={() => state.listing && generateImagesOnly(state.listing.title)} className="px-14 py-6 bg-[#ff4b4b] text-white rounded-2xl font-black text-xs uppercase shadow-2xl hover:bg-red-600 transition-all transform hover:-translate-y-1 active:scale-95 shadow-red-500/20">
                          <i className="fas fa-rotate mr-3"></i> Restart Pipeline
                        </button>
                        <button onClick={handleSelectKey} className="px-14 py-6 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-slate-50 transition-all border dark:border-slate-700 active:scale-95">
                          <i className="fas fa-key mr-3 text-red-500"></i> Connect Priority Key
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
          100% { transform: translateX(250%); }
        }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ff4b4b15; border-radius: 20px; border: 2px solid transparent; background-clip: content-box; }
        ::-webkit-scrollbar-thumb:hover { background: #ff4b4b30; background-clip: content-box; }
      `}</style>
    </div>
  );
};

export default App;
