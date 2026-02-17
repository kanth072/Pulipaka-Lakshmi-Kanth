import React, { useState, useEffect, useRef } from 'react';
import { AppState, GeneratedVariant, ProductListing } from './types';
import { generateProfessionalListing, generateImageVariant } from './services/geminiService';

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

  const retrySingleVariant = async (type: 'Studio' | 'Lifestyle' | 'Contextual') => {
    if (!state.listing) return;
    setState(prev => ({ ...prev, statusMessage: `Retrying ${type} render...`, isProcessing: true }));
    try {
      const url = await generateImageVariant(state.originalImages[0], type, state.listing.title);
      const newVariant: GeneratedVariant = { id: Math.random().toString(36).substr(2, 9), url, type, prompt: `High-fidelity ${type} render` };
      setState(prev => ({
        ...prev,
        variants: [...prev.variants.filter(v => v.type !== type), newVariant],
        isProcessing: false,
        error: null
      }));
    } catch (err: any) {
      setState(prev => ({ ...prev, isProcessing: false, error: `Failed to retry ${type}: ${err.message}` }));
    }
  };

  const generateImagesOnly = async (listingTitle: string) => {
    setState(prev => ({ ...prev, isProcessing: true, statusMessage: '🎨 Syncing Render Pipeline...', error: null }));
    
    const variantTypes: ('Studio' | 'Lifestyle' | 'Contextual')[] = ['Studio', 'Lifestyle', 'Contextual'];
    const primaryImage = state.originalImages[0];
    
    // We run them sequentially to avoid hitting "Concurrent Request" limits on free keys
    const newVariants: GeneratedVariant[] = [];
    let partialFailures = false;

    for (const type of variantTypes) {
      try {
        setState(prev => ({ ...prev, statusMessage: `🎨 Rendering ${type} view...` }));
        const url = await generateImageVariant(primaryImage, type, listingTitle);
        newVariants.push({ id: Math.random().toString(36).substr(2, 9), url, type, prompt: `High-fidelity ${type} render` });
        // After each success, update the state so the user sees progress
        setState(prev => ({ ...prev, variants: [...newVariants] }));
      } catch (e: any) {
        console.warn(`Variant ${type} failed:`, e);
        partialFailures = true;
      }
    }

    if (newVariants.length === 0) {
      setState(prev => ({ ...prev, isProcessing: false, error: "Deployment Limit Hit: All render requests failed. This usually happens on Vercel deployments when many users share the same IP range for a free Gemini key. Please wait 60 seconds or use a Priority Key." }));
    } else {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        statusMessage: partialFailures ? '⚠️ Completed with partial success' : '✅ All Assets Synchronized',
        error: partialFailures ? "Some renders hit rate limits. Use the 'Retry' button on failed assets." : null
      }));
    }
  };

  const runPipeline = async () => {
    if (state.originalImages.length === 0) {
      setState(prev => ({ ...prev, error: "Upload product imagery to initiate production." }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, statusMessage: `🤖 Scanning product visuals...`, error: null, variants: [], listing: null }));

    try {
      const listing = await generateProfessionalListing(state.originalImages, state.rawDescription);
      setState(prev => ({ ...prev, listing, statusMessage: '🎨 Listing generated. Starting renders...' }));
      await generateImagesOnly(listing.title);
    } catch (err: any) {
      console.error("Pipeline failure:", err);
      let msg = err.message || "System Fault";
      
      if (msg.includes("sk-") || msg.includes("API key not valid")) {
        msg = "Incompatible Key Detected. Ensure your Vercel Environment Variable 'API_KEY' is a Google Gemini Key (starts with 'AIzaSy').";
      } else if (msg.includes("429") || msg.includes("503") || msg.includes("limit")) {
        msg = "Model Overloaded or Quota Exceeded (429/503). Vercel deployments often hit limits faster because many users share an IP. Try again in 1 minute.";
      }
      
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
    }
  };

  return (
    <div className={`flex min-h-screen font-sans transition-all duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#fcfdfe] text-slate-900'}`}>
      
      <aside className={`w-[380px] p-10 flex flex-col gap-8 border-r sticky top-0 h-screen overflow-y-auto z-40 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xl shadow-slate-200/50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-[#ff4b4b] p-3 rounded-2xl shadow-lg shadow-red-500/20"><i className="fas fa-bolt text-white text-xl"></i></div>
            <h1 className="text-2xl font-black uppercase tracking-tighter">ProductPro</h1>
          </div>
          <button onClick={() => setIsDark(!isDark)} className="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <i className={`fas ${isDark ? 'fa-sun text-amber-400' : 'fa-moon text-slate-500'}`}></i>
          </button>
        </div>

        <div className={`p-6 rounded-3xl border-2 transition-all ${hasPersonalKey ? 'border-green-500 bg-green-50/10' : 'border-blue-500/30 bg-blue-50/10'}`}>
          <div className="flex items-center justify-between mb-4">
            <Badge color={hasPersonalKey ? 'green' : 'blue'}>
              {hasPersonalKey ? 'Priority Key Active' : 'Shared Mode'}
            </Badge>
            <button onClick={handleSelectKey} className="text-[10px] font-black px-4 py-1.5 bg-[#ff4b4b] text-white rounded-full hover:bg-red-600 transition-all uppercase tracking-widest shadow-lg shadow-red-500/20">
              {hasPersonalKey ? 'Swap' : 'Connect'}
            </button>
          </div>
          <p className="text-[11px] opacity-70 leading-relaxed font-semibold">
            {hasPersonalKey 
              ? "Your Gemini key is linked. Rate limits will be per-key." 
              : "Vercel Deployment: Multiple users share the same quota. Connect a personal key to avoid 'Limit Exceeded' errors."}
          </p>
        </div>

        <div className="space-y-10">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-4 flex justify-between">
              Input Gallery <span className="text-red-500">Required</span>
            </label>
            <div className={`p-8 border-2 border-dashed rounded-[2.5rem] transition-all group flex flex-col items-center justify-center gap-4 cursor-pointer ${isDark ? 'bg-slate-800 border-slate-700 hover:border-red-500' : 'bg-slate-50 border-slate-200 hover:border-red-500'}`}>
              <div className="relative w-full text-center">
                <input type="file" accept="image/*" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                <i className="fas fa-images text-4xl text-slate-300 group-hover:text-red-500 transition-all"></i>
                <p className="text-[11px] font-black uppercase mt-3 tracking-widest text-slate-500">Add Product Photos</p>
              </div>
              {state.originalImages.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-3 w-full">
                  {state.originalImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square group/img">
                      <img src={img} className="w-full h-full object-cover rounded-2xl shadow-md border dark:border-slate-700" alt="Preview" />
                      <button onClick={(e) => { e.stopPropagation(); setState(p => ({ ...p, originalImages: p.originalImages.filter((_, i) => i !== idx) })); }} className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full text-[10px] flex items-center justify-center shadow-xl hover:scale-110 transition-all"><i className="fas fa-times"></i></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
             <div className="flex justify-between items-center mb-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contextual Data</label>
                <button onClick={toggleListening} className={`text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-2 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800'}`}>
                  <i className="fas fa-microphone"></i> {isListening ? 'STOP' : 'DICTATE'}
                </button>
             </div>
             <textarea value={state.rawDescription} onChange={(e) => setState(p => ({ ...p, rawDescription: e.target.value }))} placeholder="Key features, dimensions, color, brand details..." className={`w-full h-44 p-6 rounded-[2.5rem] border-2 text-sm focus:border-red-500 outline-none transition-all resize-none shadow-inner ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50/50 border-slate-100'}`} />
          </div>
        </div>

        <div className="mt-auto pt-8 border-t dark:border-slate-800">
          <button onClick={runPipeline} disabled={state.isProcessing} className={`w-full py-6 rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-2xl transform ${state.isProcessing ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-[#ff4b4b] text-white hover:bg-red-600 active:scale-95 shadow-red-500/30'}`}>
            {state.isProcessing ? <><i className="fas fa-circle-notch fa-spin mr-3"></i> Syncing Engine</> : '🚀 Launch Pipeline'}
          </button>

          {state.error && (
            <div className={`mt-6 p-6 rounded-3xl border-2 border-red-500/30 text-[11px] font-bold leading-relaxed shadow-xl animate-in slide-in-from-top-4 ${isDark ? 'bg-red-950/20 text-red-400' : 'bg-red-50 text-red-700'}`}>
              <div className="flex gap-4 items-start">
                <i className="fas fa-triangle-exclamation text-lg mt-1"></i>
                <div className="space-y-4">
                  <p className="text-sm font-black">{state.error}</p>
                  <button onClick={handleSelectKey} className="w-full py-3 bg-red-500 text-white rounded-2xl uppercase text-[10px] font-black hover:bg-red-600 shadow-lg shadow-red-500/20">Connect Gemini Priority Key</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 px-20 py-20 overflow-y-auto scroll-smooth">
        <div className="max-w-[1100px] mx-auto">
          <div className="mb-16 flex justify-between items-end">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <Badge color="red">Enterprise v2</Badge>
                <Badge color="blue">Flash Mode Active</Badge>
              </div>
              <h1 className={`text-5xl font-black tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>Production Dashboard</h1>
            </div>
          </div>
          
          {state.isProcessing && (
            <div className="mb-16 animate-in fade-in slide-in-from-top-6 duration-700">
              <div className={`p-12 rounded-[3.5rem] border-4 border-red-500/10 flex flex-col gap-8 ${isDark ? 'bg-slate-900 shadow-2xl shadow-black/50' : 'bg-white shadow-2xl shadow-slate-200/50'}`}>
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-8">
                      <div className="w-16 h-16 border-[6px] border-red-500/10 border-t-red-500 rounded-full animate-spin"></div>
                      <div>
                        <span className="text-3xl font-black tracking-tight block mb-1">{state.statusMessage}</span>
                        <span className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                           <i className="fas fa-server"></i> Optimizing API Requests
                        </span>
                      </div>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {!state.listing && !state.isProcessing && (
            <div className={`p-52 text-center rounded-[5rem] border-4 border-dashed transition-all flex flex-col items-center justify-center gap-10 ${isDark ? 'border-slate-800 bg-slate-900/30' : 'border-slate-100 bg-white'}`}>
              <div className="w-40 h-40 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-200 dark:text-slate-800 shadow-inner">
                <i className="fas fa-wand-magic-sparkles text-7xl opacity-20"></i>
              </div>
              <div className="space-y-4">
                <p className="font-black text-4xl uppercase tracking-tighter opacity-10">Asset Engine Ready</p>
                <p className="text-xs opacity-10 font-black uppercase tracking-[0.5em]">Populate input fields to begin</p>
              </div>
            </div>
          )}

          {state.listing && (
            <div className="space-y-24 animate-in fade-in duration-1000">
              
              <StCard isDark={isDark} title="Metadata Output">
                <div className="flex justify-between items-start mb-16 border-b dark:border-slate-800 pb-12">
                  <div className="flex-1 pr-20">
                    <span className="text-[11px] font-black text-red-500 uppercase tracking-[0.5em] block mb-4">Optimized Title</span>
                    <h2 className={`text-6xl font-black leading-[1] tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>{state.listing.title}</h2>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
                  <div className="lg:col-span-8 space-y-16">
                    <p className={`text-3xl leading-[1.4] italic font-medium p-16 rounded-[4rem] border shadow-2xl ${isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50/50 border-slate-200 text-slate-700'}`}>
                      "{state.listing.description}"
                    </p>
                    <div className="grid grid-cols-1 gap-5">
                      {state.listing.keyFeatures.map((f, i) => (
                        <div key={i} className={`flex items-center gap-6 text-xl font-bold p-8 rounded-3xl border transition-all hover:scale-[1.01] ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-100 shadow-lg'}`}>
                          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500"><i className="fas fa-check"></i></div>
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="lg:col-span-4 space-y-10">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 mb-8">Technical Attributes</h4>
                    <div className="flex flex-col gap-4">
                      {state.listing.specifications.map((s, i) => (
                        <div key={i} className={`p-8 border rounded-[2.5rem] flex flex-col gap-2 transition-all hover:border-red-500/50 ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-white shadow-xl'}`}>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.key}</span>
                          <span className="text-lg font-black tracking-tight">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </StCard>

              <section className="pt-24 border-t-8 border-slate-100 dark:border-slate-900 space-y-24 pb-48">
                 <div className="flex justify-between items-end">
                    <h3 className="text-5xl font-black uppercase tracking-tighter flex items-center gap-8">
                       <div className="w-16 h-16 bg-red-500 rounded-[2rem] flex items-center justify-center text-white text-3xl shadow-2xl shadow-red-500/40"><i className="fas fa-layer-group"></i></div>
                       HD Visual Library
                     </h3>
                     <Badge color="blue">{state.variants.length} / 3 Assets Rendered</Badge>
                 </div>

                <div className="grid grid-cols-1 gap-40">
                  {['Studio', 'Lifestyle', 'Contextual'].map((type) => {
                    const v = state.variants.find(item => item.type === type);
                    return (
                      <div key={type} className={`rounded-[5rem] overflow-hidden shadow-2xl border-4 transition-all ${isDark ? 'border-slate-800 bg-black' : 'border-slate-100 bg-white'} group relative min-h-[400px] flex flex-col`}>
                        {v ? (
                          <>
                            <div className="absolute top-16 right-16 z-30 opacity-0 group-hover:opacity-100 transition-all transform translate-y-10 group-hover:translate-y-0 flex gap-4">
                              <button onClick={() => retrySingleVariant(type as any)} className="bg-white/90 backdrop-blur px-8 py-6 rounded-full text-sm font-black text-slate-900 shadow-2xl hover:bg-amber-500 hover:text-white transition-all transform active:scale-90">
                                <i className="fas fa-sync-alt"></i> REDO
                              </button>
                              <button onClick={() => { const a = document.createElement('a'); a.href = v.url; a.download = `${v.type}.png`; a.click(); }} className="bg-white px-12 py-6 rounded-full text-sm font-black text-slate-900 shadow-2xl flex items-center gap-6 hover:bg-red-500 hover:text-white transition-all transform active:scale-90">
                                <i className="fas fa-cloud-download-alt"></i> EXPORT
                              </button>
                            </div>
                            <div className="p-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-3xl border-b-4 dark:border-slate-800 flex justify-between items-center px-24 relative z-10">
                               <div className="flex items-center gap-10">
                                  <div className="w-16 h-16 rounded-[1.5rem] bg-red-500/10 flex items-center justify-center text-red-500 text-2xl font-black">
                                     {v.type[0]}
                                  </div>
                                  <div>
                                     <span className="text-lg font-black uppercase tracking-[0.6em] text-red-500 block mb-1">{v.type} VIEW</span>
                                     <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Master Asset Synchronized</span>
                                  </div>
                               </div>
                            </div>
                            <div className="aspect-square bg-[#0a0a0a] relative overflow-hidden flex items-center justify-center flex-1">
                               <img src={v.url} alt={v.type} className="w-full h-full object-cover transition-transform duration-[5000ms] group-hover:scale-110 ease-out" />
                            </div>
                          </>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center p-20 text-center gap-8">
                            <div className="w-24 h-24 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-300">
                               <i className={`fas ${state.isProcessing ? 'fa-spinner fa-spin' : 'fa-image'} text-4xl opacity-30`}></i>
                            </div>
                            <div>
                               <h4 className="text-2xl font-black uppercase tracking-tighter opacity-30">{type} Render Pending</h4>
                               {!state.isProcessing && (
                                 <button onClick={() => retrySingleVariant(type as any)} className="mt-8 px-12 py-5 bg-[#ff4b4b] text-white rounded-full font-black text-xs uppercase shadow-xl hover:bg-red-600 active:scale-95 transition-all">
                                   <i className="fas fa-bolt mr-2"></i> Generate Individually
                                 </button>
                               )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>

      <style>{`
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ff4b4b10; border-radius: 20px; border: 3px solid transparent; background-clip: content-box; }
        ::-webkit-scrollbar-thumb:hover { background: #ff4b4b30; background-clip: content-box; }
      `}</style>
    </div>
  );
};

export default App;