import React, { useState, useEffect, useRef } from 'react';
import { AppState, GeneratedVariant, ProductListing } from './types';
import { generateProfessionalListing, generateImageVariant } from './services/geminiService';

// --- Streamlit-like UI Components ---

const StHeader = ({ children, isDark }: { children?: React.ReactNode, isDark: boolean }) => (
  <h1 className={`text-3xl font-extrabold mb-6 border-b pb-4 tracking-tight transition-colors ${isDark ? 'text-slate-100 border-slate-800' : 'text-slate-900 border-slate-200'}`}>
    {children}
  </h1>
);

const StSubheader = ({ children, isDark }: { children?: React.ReactNode, isDark: boolean }) => (
  <h2 className={`text-xl font-bold mt-8 mb-4 flex items-center gap-2 transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
    {children}
  </h2>
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

// --- Main App ---

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
  const [interimText, setInterimText] = useState('');
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
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
          else interimTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) {
          setState(prev => ({
            ...prev,
            rawDescription: (prev.rawDescription ? prev.rawDescription + ' ' : '') + finalTranscript.trim()
          }));
        }
        setInterimText(interimTranscript);
      };
      recognition.onend = () => { setIsListening(false); setInterimText(''); };
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
    if (files && files.length > 0) {
      const readers = Array.from(files).map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });
      Promise.all(readers).then(newImages => {
        setState(prev => ({ ...prev, originalImages: [...prev.originalImages, ...newImages], error: null }));
      });
    }
  };

  const runPipeline = async () => {
    if (state.originalImages.length === 0) {
      setState(prev => ({ ...prev, error: "Please upload at least one product photo." }));
      return;
    }

    setState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      statusMessage: `🤖 Analyzing photos...`,
      error: null,
      variants: [],
      listing: null
    }));

    try {
      const listing = await generateProfessionalListing(state.originalImages, state.rawDescription);
      setState(prev => ({ ...prev, listing, statusMessage: '🚀 Generating HD variants in parallel...' }));

      const variantTypes: ('Studio' | 'Lifestyle' | 'Contextual')[] = ['Studio', 'Lifestyle', 'Contextual'];
      const primaryImage = state.originalImages[0];

      const variantPromises = variantTypes.map(async (type) => {
        try {
          const imageUrl = await generateImageVariant(primaryImage, type, listing.title);
          return { id: Math.random().toString(36).substr(2, 9), url: imageUrl, type, prompt: `Professional ${type} variant` } as GeneratedVariant;
        } catch (err) { return null; }
      });

      const resolvedVariants = await Promise.all(variantPromises);
      const successfulVariants = resolvedVariants.filter((v): v is GeneratedVariant => v !== null);

      setState(prev => ({ ...prev, variants: successfulVariants, isProcessing: false, statusMessage: '✅ Pipeline Ready' }));
    } catch (err: any) {
      console.error("Pipeline Error:", err);
      let errorMsg = err.message || "Pipeline failed";
      if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
        errorMsg = "API Quota Exceeded. The free tier is currently overloaded. Please connect your own API key to continue.";
      }
      setState(prev => ({ ...prev, isProcessing: false, error: errorMsg }));
    }
  };

  return (
    <div className={`flex min-h-screen font-sans transition-colors duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#f8fafc] text-slate-900'}`}>
      
      {/* Sidebar */}
      <aside className={`w-[360px] p-8 flex flex-col gap-8 border-r transition-colors duration-300 shadow-xl z-20 sticky top-0 h-screen ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff4b4b] p-2 rounded-lg"><i className="fas fa-bolt text-white text-xl"></i></div>
            <h1 className="text-2xl font-black tracking-tighter uppercase">ProductPro</h1>
          </div>
          <button onClick={() => setIsDark(!isDark)} className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-slate-800 text-amber-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
          </button>
        </div>

        <div className={`p-4 rounded-xl border flex flex-col gap-2 transition-all ${hasPersonalKey ? (isDark ? 'bg-green-950/20 border-green-900' : 'bg-green-50 border-green-100') : (isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100')}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-widest ${hasPersonalKey ? 'text-green-500' : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>
              <i className={`fas ${hasPersonalKey ? 'fa-key' : 'fa-unlock'} mr-1.5`}></i>
              {hasPersonalKey ? 'Personal Key Active' : 'Shared Key Mode'}
            </span>
            <button onClick={handleSelectKey} className="text-[10px] font-black text-blue-500 hover:text-blue-600 underline uppercase tracking-widest">
              {hasPersonalKey ? 'Switch' : 'Connect'}
            </button>
          </div>
          {!hasPersonalKey && (
             <p className={`text-[9px] font-bold leading-tight ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
               Avoid quota errors by using your own key from <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline">AI Studio</a>.
             </p>
          )}
        </div>

        <section>
          <label className={`block text-sm font-bold mb-3 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Step 1: Product Photos</label>
          <div className={`p-5 border-2 border-dashed rounded-xl transition-all group ${isDark ? 'bg-slate-800 border-slate-700 hover:border-[#ff4b4b]' : 'bg-slate-50 border-slate-200 hover:border-[#ff4b4b]'}`}>
            <input type="file" accept="image/*" multiple onChange={handleFileChange} className={`text-xs w-full cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-[#ff4b4b] file:text-white hover:file:bg-[#e63939] ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
            {state.originalImages.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                {state.originalImages.map((img, idx) => (
                  <div key={idx} className="relative group/thumb">
                    <img src={img} className={`rounded-lg border-2 shadow-sm w-full h-16 object-cover ${isDark ? 'border-slate-700 bg-slate-900' : 'border-white bg-white'}`} alt="Product" />
                    <button onClick={() => setState(prev => ({ ...prev, originalImages: prev.originalImages.filter((_, i) => i !== idx) }))} className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"><i className="fas fa-times"></i></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <label className={`block text-sm font-bold mb-3 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Step 2: Description</label>
          <textarea value={state.rawDescription} onChange={(e) => setState(prev => ({ ...prev, rawDescription: e.target.value }))} placeholder="Features like brand, material..." className={`w-full rounded-xl border-2 p-4 text-sm h-24 focus:border-[#ff4b4b] focus:ring-0 outline-none transition-all shadow-inner font-medium block ${isDark ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600' : 'bg-white border-slate-100 text-slate-900 placeholder-slate-400'}`} />
        </section>

        <button onClick={runPipeline} disabled={state.isProcessing} className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all transform active:scale-95 shadow-xl ${state.isProcessing ? (isDark ? 'bg-slate-800 text-slate-600' : 'bg-slate-200 text-slate-400') + ' cursor-not-allowed' : 'bg-[#ff4b4b] text-white hover:bg-[#e63939]'}`}>
          {state.isProcessing ? <span className="flex items-center justify-center gap-3"><i className="fas fa-circle-notch fa-spin"></i> Processing...</span> : '🚀 Start Pipeline'}
        </button>

        {state.error && (
          <div className={`border p-4 rounded-xl flex flex-col gap-3 shadow-lg ${isDark ? 'bg-red-950/20 border-red-900' : 'bg-red-50 border-red-200'}`}>
            <div className="flex gap-2">
              <i className="fas fa-exclamation-triangle text-red-500 mt-1 shrink-0"></i>
              <div className={`text-[11px] font-bold leading-relaxed break-words ${isDark ? 'text-red-400' : 'text-red-700'}`}>{state.error}</div>
            </div>
            {state.error.includes("Quota") && (
              <button onClick={handleSelectKey} className="w-full py-2 bg-[#ff4b4b] text-white text-[10px] font-black uppercase rounded-lg hover:bg-red-600 shadow-md transition-all">Select Personal API Key</button>
            )}
          </div>
        )}
      </aside>

      {/* Main Panel */}
      <main className="flex-1 overflow-y-auto px-12 py-16 scroll-smooth z-10 relative">
        <div className="max-w-[850px] mx-auto">
          <StHeader isDark={isDark}>Product Asset Pipeline</StHeader>
          <p className={`font-medium -mt-4 mb-12 text-lg transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Professional Flipkart listings & parallel HD rendering.</p>

          {!state.isProcessing && !state.listing && (
            <div className={`border-2 border-dashed rounded-3xl p-32 text-center shadow-sm transition-all ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 ${isDark ? 'bg-slate-800' : 'bg-slate-50'}`}><i className={`fas fa-layer-group text-3xl ${isDark ? 'text-slate-700' : 'text-slate-300'}`}></i></div>
              <p className={`font-bold text-xl tracking-tight ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Awaiting Pipeline Input</p>
            </div>
          )}

          {state.isProcessing && <StInfo isDark={isDark}>{state.statusMessage}</StInfo>}
          
          {state.listing && (
            <div className="animate-in fade-in slide-in-from-bottom-5 duration-500">
              <StSuccess isDark={isDark}>Marketplace Catalog Ready</StSuccess>
              <div className={`border rounded-2xl p-8 shadow-xl mb-12 relative overflow-hidden ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <h3 className="text-[10px] font-black text-[#ff4b4b] uppercase tracking-[0.2em] mb-2">Listing Title</h3>
                <h2 className={`text-2xl font-black mb-6 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{state.listing.title}</h2>
                <div className="prose prose-slate max-w-none">
                  <h3 className="text-[10px] font-black text-[#ff4b4b] uppercase tracking-[0.2em] mb-2">Description</h3>
                  <p className={`text-lg leading-relaxed p-5 rounded-xl border italic font-medium ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>"{state.listing.description}"</p>
                </div>
              </div>
            </div>
          )}

          {state.variants.length > 0 && (
            <div className="mt-12 space-y-12 animate-in fade-in duration-700">
              {state.variants.map((v) => (
                <div key={v.id} className={`rounded-3xl border shadow-2xl overflow-hidden ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                  <div className={`p-4 border-b flex justify-between items-center ${isDark ? 'bg-slate-800/50 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                    <span className="text-xs font-black uppercase tracking-widest">{v.type} VIEW</span>
                    <button onClick={() => { const l = document.createElement('a'); l.href = v.url; l.download = `Product_${v.type}.png`; l.click(); }} className="text-[10px] px-4 py-1.5 rounded-full bg-[#ff4b4b] text-white font-black uppercase shadow-md">Download</button>
                  </div>
                  <img src={v.url} alt={v.type} className="w-full aspect-square object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;