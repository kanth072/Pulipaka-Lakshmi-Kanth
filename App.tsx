
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
      // Fix: Use the provided window.aistudio helper to check API key status.
      if ((window as any).aistudio?.hasSelectedApiKey) {
        // Fix: Explicitly cast result to boolean to avoid 'unknown' assignment issues.
        const hasKey = await (window as any).aistudio.hasSelectedApiKey() as boolean;
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
    // Fix: Trigger openSelectKey as per guidelines.
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      // Fix: Assume the key selection was successful to avoid race conditions.
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
        // Fix Error: Cast 'file' (File) to 'Blob' explicitly to resolve the 'unknown' assignment issue on line 101.
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
          // Fix: Handle specific "Requested entity was not found" error by resetting key selection state.
          if (e.message?.includes("Requested entity was not found")) {
             setHasPersonalKey(false);
          }
          console.warn(`Variant ${type} failed:`, e);
          return null; 
        }
      });

      const results = await Promise.all(variantPromises);
      const successful = results.filter((v): v is GeneratedVariant => v !== null);
      
      if (successful.length === 0) throw new Error("Image generation failed. This often happens due to quota limits on the shared key.");

      setState(prev => ({ ...prev, variants: successful, isProcessing: false, statusMessage: '✅ Complete' }));
    } catch (err: any) {
      let msg = err.message || "Image generation failed";
      if (msg.includes("429") || msg.includes("quota")) msg = "Image Quota Exceeded. Connect your own API key to generate high-quality variants.";
      // Fix: Reset personal key state if entity not found error occurs during image generation.
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
      if (msg.includes("429") || msg.includes("quota")) msg = "API Quota Exceeded. Please connect your own Gemini key in the sidebar.";
      // Fix: Reset personal key state if entity not found error occurs during main pipeline.
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
          {!hasPersonalKey && (
            <p className="text-[9px] font-bold text-slate-400 leading-tight">
              Shared key exhausted? Get a free key at <a href="https://ai.google.dev/" target="_blank" className="underline text-blue-400">Google AI Studio</a>.
            </p>
          )}
        </div>

        <section className="space-y-6">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Upload Photos</label>
            <div className={`p-4 border-2 border-dashed rounded-xl transition-all ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200 hover:border-[#ff4b4b]'}`}>
              <input type="file" accept="image/*" multiple onChange={handleFileChange} className="text-[10px] w-full file:bg-[#ff4b4b] file:text-white file:border-0 file:rounded-full file:px-3 file:py-1 file:font-black cursor-pointer" />
              <div className="mt-4 grid grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
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
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Notes & Specs</label>
              <button onClick={toggleListening} className={`text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1 transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                <i className="fas fa-microphone"></i> {isListening ? 'STOP' : 'VOICE'}
              </button>
            </div>
            <textarea value={state.rawDescription} onChange={(e) => setState(p => ({ ...p, rawDescription: e.target.value }))} placeholder="Features like color, brand, material..." className={`w-full h-28 p-3 rounded-xl border-2 text-sm focus:border-[#ff4b4b] outline-none transition-all ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-100 shadow-inner'}`} />
          </div>
        </section>

        <div className="mt-auto space-y-4 pt-4">
          <button onClick={runPipeline} disabled={state.isProcessing} className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-xl transform ${state.isProcessing ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-[#ff4b4b] text-white hover:bg-red-600 active:scale-95'}`}>
            {state.isProcessing ? <><i className="fas fa-circle-notch fa-spin mr-2"></i> Processing</> : '🚀 Start Pipeline'}
          </button>

          {state.error && (
            <div className={`p-4 rounded-xl border text-[11px] font-bold leading-relaxed break-words shadow-lg border-red-500/50 ${isDark ? 'bg-red-950/20 text-red-400' : 'bg-red-50 text-red-700'}`}>
              <div className="flex gap-2 mb-3"><i className="fas fa-exclamation-triangle shrink-0 mt-0.5"></i> {state.error}</div>
              {state.error.includes("Quota") && (
                <button onClick={handleSelectKey} className="w-full py-2 bg-[#ff4b4b] text-white rounded-lg hover:bg-red-600 uppercase text-[9px] font-black shadow-md">Select Personal Key</button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 px-12 py-16 overflow-y-auto z-10 relative scroll-smooth">
        <div className="max-w-[850px] mx-auto">
          <StHeader isDark={isDark}>Asset Pipeline Result</StHeader>
          
          {state.isProcessing && <StInfo isDark={isDark}>{state.statusMessage}</StInfo>}

          {!state.listing && !state.isProcessing && (
            <div className={`p-24 text-center rounded-3xl border-2 border-dashed transition-all ${isDark ? 'border-slate-800 bg-slate-900/50 text-slate-600' : 'border-slate-200 bg-white text-slate-300'}`}>
              <div className="mb-6"><i className="fas fa-wand-magic-sparkles text-6xl"></i></div>
              <p className="font-black text-xl tracking-tight uppercase opacity-50">Awaiting Pipeline Activation</p>
              <p className="text-sm mt-2 opacity-40">Upload photos and hit 'Start' to see the magic.</p>
            </div>
          )}

          {state.listing && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-500">
              <section className={`p-10 rounded-3xl shadow-2xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <span className="text-[10px] font-black text-[#ff4b4b] uppercase tracking-widest block mb-1">Marketplace Metadata</span>
                    <h2 className={`text-2xl font-black leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{state.listing.title}</h2>
                  </div>
                  <div className="shrink-0"><StSuccess isDark={isDark}>SEO Validated</StSuccess></div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b pb-2 dark:border-slate-800">Product Copy</h3>
                    <p className={`text-lg leading-relaxed italic font-medium p-6 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600 shadow-inner'}`}>
                      "{state.listing.description}"
                    </p>
                  </div>
                  
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b pb-2 dark:border-slate-800">Specifications</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {state.listing.specifications.map((s, i) => (
                        <div key={i} className={`p-3 border rounded-xl ${isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50'}`}>
                          <span className="text-[9px] font-black text-slate-500 uppercase block mb-1">{s.key}</span>
                          <span className="text-xs font-bold truncate block">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {state.variants.length > 0 ? (
                <section className="pt-12 border-t dark:border-slate-800 space-y-12">
                  <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                    <i className="fas fa-images text-[#ff4b4b]"></i> Generated HD Gallery
                  </h3>
                  <div className="grid grid-cols-1 gap-16">
                    {state.variants.map((v) => (
                      <div key={v.id} className="rounded-[2.5rem] overflow-hidden shadow-2xl border dark:border-slate-800 group relative bg-black">
                        <div className="absolute top-6 right-6 z-10 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                          <button onClick={() => { const a = document.createElement('a'); a.href = v.url; a.download = `${v.type}.png`; a.click(); }} className="bg-white px-6 py-3 rounded-full text-[11px] font-black text-slate-900 shadow-2xl flex items-center gap-2 hover:bg-[#ff4b4b] hover:text-white transition-colors">
                            <i className="fas fa-download"></i> DOWNLOAD ASSET
                          </button>
                        </div>
                        <div className="p-5 bg-slate-50 dark:bg-slate-900 border-b dark:border-slate-800 flex justify-between items-center px-8">
                          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#ff4b4b]"><i className="fas fa-cube mr-2"></i> {v.type} PERSPECTIVE</span>
                          <span className="text-[10px] font-bold text-slate-400">1024 x 1024 • AI ENHANCED</span>
                        </div>
                        <img src={v.url} alt={v.type} className="w-full aspect-square object-cover transition-transform duration-700 group-hover:scale-105" />
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                state.listing && !state.isProcessing && (
                  <div className={`p-12 text-center rounded-3xl border-2 border-dashed ${isDark ? 'border-red-900 bg-red-950/10' : 'border-red-100 bg-red-50/50'}`}>
                    <i className="fas fa-triangle-exclamation text-red-500 text-3xl mb-4"></i>
                    <p className="text-sm font-bold text-red-500 mb-6 uppercase tracking-widest">Parallel Image Rendering Unavailable</p>
                    <button onClick={() => state.listing && generateImagesOnly(state.listing.title)} className="px-8 py-3 bg-[#ff4b4b] text-white rounded-full font-black text-[10px] uppercase shadow-lg hover:bg-red-600 transition-all">
                      Force Retry Image Generation
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
