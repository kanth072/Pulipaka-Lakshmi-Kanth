
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
    localStorage.setItem('productpro-theme', isDark ? 'dark' : 'light');
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDark]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true; // Crucial for "Fast Response"
      recognition.lang = 'en-US'; // Broad default, but interimResults makes it feel faster in any lang
      
      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript || interimTranscript) {
          setState(prev => ({ 
            ...prev, 
            rawDescription: (prev.rawDescription.split('. ').slice(0, -1).join('. ') + (prev.rawDescription ? '. ' : '') + (finalTranscript || interimTranscript)).trim() 
          }));
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
      
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
    const newVariants: GeneratedVariant[] = [];
    let partialFailures = false;

    for (const type of variantTypes) {
      try {
        setState(prev => ({ ...prev, statusMessage: `🎨 Rendering ${type} view...` }));
        const url = await generateImageVariant(primaryImage, type, listingTitle);
        newVariants.push({ id: Math.random().toString(36).substr(2, 9), url, type, prompt: `High-fidelity ${type} render` });
        setState(prev => ({ ...prev, variants: [...newVariants] }));
      } catch (e: any) {
        console.warn(`Variant ${type} failed:`, e);
        partialFailures = true;
      }
    }

    if (newVariants.length === 0) {
      setState(prev => ({ ...prev, isProcessing: false, error: "Render limit exceeded. Please wait a moment or use a Priority Key." }));
    } else {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        statusMessage: partialFailures ? '⚠️ Partial Success' : '✅ Assets Ready',
        error: partialFailures ? "Some renders hit rate limits." : null
      }));
    }
  };

  const runPipeline = async () => {
    if (state.originalImages.length === 0) {
      setState(prev => ({ ...prev, error: "Upload product imagery to initiate production." }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, statusMessage: `🤖 Deep-Scanning Assets...`, error: null, variants: [], listing: null }));

    try {
      const listing = await generateProfessionalListing(state.originalImages, state.rawDescription);
      setState(prev => ({ ...prev, listing, statusMessage: '🎨 Generating HD Variants...' }));
      await generateImagesOnly(listing.title);
    } catch (err: any) {
      console.error("Pipeline failure:", err);
      let msg = err.message || "System Error";
      if (msg.includes("429") || msg.includes("503")) {
        msg = "Engine Overloaded. Please retry in 60 seconds.";
      }
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
    }
  };

  return (
    <div className={`flex min-h-screen font-sans transition-all duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#fcfdfe] text-slate-900'}`}>
      
      {/* SIDEBAR: Focused Input Area */}
      <aside className={`w-[380px] p-8 flex flex-col gap-10 border-r sticky top-0 h-screen overflow-y-auto z-40 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xl'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-[#ff4b4b] p-3 rounded-2xl shadow-lg shadow-red-500/20"><i className="fas fa-bolt text-white text-xl"></i></div>
            <h1 className="text-2xl font-black uppercase tracking-tighter">ProductPro</h1>
          </div>
          <button onClick={() => setIsDark(!isDark)} className="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <i className={`fas ${isDark ? 'fa-sun text-amber-400' : 'fa-moon text-slate-50'}`}></i>
          </button>
        </div>

        <div className="space-y-12">
          {/* Section 1: Visuals */}
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Input Gallery</label>
              <Badge color="red">Required</Badge>
            </div>
            <div className={`p-8 border-2 border-dashed rounded-[2.5rem] transition-all group flex flex-col items-center justify-center gap-4 cursor-pointer min-h-[160px] ${isDark ? 'bg-slate-800/50 border-slate-700 hover:border-red-500' : 'bg-slate-50 border-slate-200 hover:border-red-500'}`}>
              <div className="relative w-full text-center">
                <input type="file" accept="image/*" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                <i className="fas fa-images text-3xl text-slate-300 group-hover:text-red-500 transition-all"></i>
                <p className="text-[11px] font-black uppercase mt-3 tracking-widest text-slate-500">Add Photos</p>
              </div>
              {state.originalImages.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-3 w-full">
                  {state.originalImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square group/img">
                      <img src={img} className="w-full h-full object-cover rounded-xl shadow-md border dark:border-slate-700" alt="Preview" />
                      <button onClick={(e) => { e.stopPropagation(); setState(p => ({ ...p, originalImages: p.originalImages.filter((_, i) => i !== idx) })); }} className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full text-[10px] flex items-center justify-center shadow-xl hover:scale-110 transition-all"><i className="fas fa-times"></i></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Text / Voice */}
          <div className="space-y-4">
             <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contextual Data</label>
                <button 
                  onClick={toggleListening} 
                  className={`text-[10px] font-black px-4 py-2 rounded-full flex items-center gap-2 transition-all shadow-lg ${isListening ? 'bg-red-500 text-white animate-pulse shadow-red-500/40' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                >
                  <i className={`fas ${isListening ? 'fa-microphone-slash' : 'fa-microphone'}`}></i> {isListening ? 'STOP' : 'DICTATE'}
                </button>
             </div>
             <div className="relative">
                <textarea 
                  value={state.rawDescription} 
                  onChange={(e) => setState(p => ({ ...p, rawDescription: e.target.value }))} 
                  placeholder="Key features, brand, dimensions..." 
                  className={`w-full h-48 p-6 rounded-[2.5rem] border-2 text-sm focus:border-red-500 outline-none transition-all resize-none shadow-inner leading-relaxed ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50/50 border-slate-100'}`} 
                />
                {isListening && <div className="absolute bottom-6 right-6 flex gap-1 items-center">
                  <div className="w-1 h-3 bg-red-500 animate-bounce" style={{animationDelay: '0ms'}} />
                  <div className="w-1 h-5 bg-red-500 animate-bounce" style={{animationDelay: '150ms'}} />
                  <div className="w-1 h-3 bg-red-500 animate-bounce" style={{animationDelay: '300ms'}} />
                </div>}
             </div>
          </div>
        </div>

        <div className="mt-auto pt-8 border-t dark:border-slate-800">
          <button 
            onClick={runPipeline} 
            disabled={state.isProcessing} 
            className={`w-full py-6 rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-2xl transform active:scale-95 ${state.isProcessing ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-[#ff4b4b] text-white hover:bg-red-600 shadow-red-500/30'}`}
          >
            {state.isProcessing ? <><i className="fas fa-sync fa-spin mr-3"></i> Processing</> : '🚀 Execute Pipeline'}
          </button>

          {state.error && (
            <div className={`mt-6 p-6 rounded-3xl border-2 border-red-500/30 text-[11px] font-bold leading-relaxed shadow-xl animate-in fade-in ${isDark ? 'bg-red-950/20 text-red-400' : 'bg-red-50 text-red-700'}`}>
              <div className="flex gap-4 items-start">
                <i className="fas fa-triangle-exclamation text-lg mt-1"></i>
                <p className="text-sm font-black">{state.error}</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN PANEL: Result View */}
      <main className="flex-1 px-20 py-16 overflow-y-auto scroll-smooth">
        <div className="max-w-[1100px] mx-auto">
          <div className="mb-16 flex justify-between items-end">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <Badge color="red">Enterprise v2</Badge>
                <Badge color="blue">Optimized Pipeline</Badge>
              </div>
              <h1 className={`text-5xl font-black tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>Asset Production Dashboard</h1>
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
                           <i className="fas fa-server"></i> Optimizing API Workload
                        </span>
                      </div>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {!state.listing && !state.isProcessing && (
            <div className={`p-48 text-center rounded-[5rem] border-4 border-dashed transition-all flex flex-col items-center justify-center gap-10 ${isDark ? 'border-slate-800 bg-slate-900/30' : 'border-slate-100 bg-white'}`}>
              <div className="w-36 h-36 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-200 dark:text-slate-800 shadow-inner">
                <i className="fas fa-wand-magic-sparkles text-6xl opacity-20"></i>
              </div>
              <div className="space-y-4">
                <p className="font-black text-3xl uppercase tracking-tighter opacity-10">Asset Engine Ready</p>
                <p className="text-xs opacity-10 font-black uppercase tracking-[0.5em]">Upload photos and describe the product to begin</p>
              </div>
            </div>
          )}

          {state.listing && (
            <div className="space-y-24 animate-in fade-in duration-1000">
              
              <StCard isDark={isDark} title="Copy Generation">
                <div className="flex justify-between items-start mb-16 border-b dark:border-slate-800 pb-12">
                  <div className="flex-1 pr-20">
                    <span className="text-[11px] font-black text-red-500 uppercase tracking-[0.5em] block mb-4">Optimized Title</span>
                    <h2 className={`text-5xl font-black leading-[1.1] tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>{state.listing.title}</h2>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                  <div className="lg:col-span-8 space-y-12">
                    <p className={`text-2xl leading-[1.4] italic font-medium p-12 rounded-[3.5rem] border shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                      "{state.listing.description}"
                    </p>
                    <div className="grid grid-cols-1 gap-4">
                      {state.listing.keyFeatures.map((f, i) => (
                        <div key={i} className={`flex items-center gap-6 text-lg font-bold p-6 rounded-2xl border transition-all ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-50 shadow-md'}`}>
                          <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500"><i className="fas fa-check text-xs"></i></div>
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="lg:col-span-4 space-y-8">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Specifications</h4>
                    <div className="flex flex-col gap-4">
                      {state.listing.specifications.map((s, i) => (
                        <div key={i} className={`p-6 border rounded-[2rem] flex flex-col gap-1 transition-all ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-white shadow-lg'}`}>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.key}</span>
                          <span className="text-base font-black tracking-tight">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </StCard>

              <section className="pt-24 border-t-8 border-slate-100 dark:border-slate-900 space-y-24 pb-48">
                 <div className="flex justify-between items-end">
                    <h3 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-8">
                       <div className="w-14 h-14 bg-red-500 rounded-2xl flex items-center justify-center text-white text-2xl shadow-2xl shadow-red-500/40"><i className="fas fa-layer-group"></i></div>
                       HD Visual Library
                     </h3>
                     <Badge color="blue">{state.variants.length} of 3 Synchronized</Badge>
                 </div>

                <div className="grid grid-cols-1 gap-40">
                  {['Studio', 'Lifestyle', 'Contextual'].map((type) => {
                    const v = state.variants.find(item => item.type === type);
                    return (
                      <div key={type} className={`rounded-[4.5rem] overflow-hidden shadow-2xl border-4 transition-all ${isDark ? 'border-slate-800 bg-black' : 'border-slate-100 bg-white'} group relative min-h-[400px] flex flex-col`}>
                        {v ? (
                          <>
                            <div className="absolute top-12 right-12 z-30 opacity-0 group-hover:opacity-100 transition-all transform translate-y-10 group-hover:translate-y-0 flex gap-4">
                              <button onClick={() => retrySingleVariant(type as any)} className="bg-white/90 backdrop-blur px-8 py-4 rounded-full text-xs font-black text-slate-900 shadow-2xl hover:bg-amber-500 hover:text-white transition-all transform active:scale-90">
                                <i className="fas fa-sync-alt"></i> REDO
                              </button>
                              <button onClick={() => { const a = document.createElement('a'); a.href = v.url; a.download = `${v.type}.png`; a.click(); }} className="bg-white px-10 py-4 rounded-full text-xs font-black text-slate-900 shadow-2xl flex items-center gap-4 hover:bg-red-500 hover:text-white transition-all transform active:scale-90">
                                <i className="fas fa-cloud-download-alt"></i> EXPORT
                              </button>
                            </div>
                            <div className="p-12 bg-white/95 dark:bg-slate-900/95 backdrop-blur-3xl border-b-4 dark:border-slate-800 flex justify-between items-center px-20 relative z-10">
                               <div className="flex items-center gap-8">
                                  <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 text-2xl font-black">
                                     {v.type[0]}
                                  </div>
                                  <div>
                                     <span className="text-base font-black uppercase tracking-[0.4em] text-red-500 block mb-1">{v.type} VIEW</span>
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Master Production Ready</span>
                                  </div>
                               </div>
                            </div>
                            <div className="aspect-square bg-[#0a0a0a] relative overflow-hidden flex items-center justify-center flex-1">
                               <img src={v.url} alt={v.type} className="w-full h-full object-cover transition-transform duration-[4000ms] group-hover:scale-110 ease-out" />
                            </div>
                          </>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center p-20 text-center gap-6">
                            <div className="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-300">
                               <i className={`fas ${state.isProcessing ? 'fa-spinner fa-spin' : 'fa-image'} text-3xl opacity-20`}></i>
                            </div>
                            <h4 className="text-xl font-black uppercase tracking-tighter opacity-20">{type} Render Pending</h4>
                            {!state.isProcessing && (
                               <button onClick={() => retrySingleVariant(type as any)} className="px-10 py-4 bg-[#ff4b4b] text-white rounded-full font-black text-[10px] uppercase shadow-xl hover:bg-red-600 active:scale-95 transition-all">
                                 <i className="fas fa-bolt mr-2"></i> Trigger Render
                               </button>
                            )}
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
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ff4b4b10; border-radius: 20px; border: 2px solid transparent; background-clip: content-box; }
        ::-webkit-scrollbar-thumb:hover { background: #ff4b4b30; }
      `}</style>
    </div>
  );
};

export default App;
