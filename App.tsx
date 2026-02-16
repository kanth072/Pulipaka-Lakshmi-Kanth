
import React, { useState, useEffect, useRef } from 'react';
import { AppState, GeneratedVariant } from './types';
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

const StExpander = ({ title, children, isDark }: { title: string, children?: React.ReactNode, isDark: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={`border rounded-lg mb-4 overflow-hidden shadow-sm transition-colors ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex justify-between items-center p-4 transition-all text-sm font-bold ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'}`}
      >
        <span>{isOpen ? '▼' : '▶'} {title}</span>
        <i className={`fas ${isOpen ? 'fa-code-branch' : 'fa-code'} opacity-30`}></i>
      </button>
      {isOpen && (
        <div className={`p-4 border-t animate-in fade-in zoom-in-95 duration-200 transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          {children}
        </div>
      )}
    </div>
  );
};

// --- Main App ---

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
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
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
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setState(prev => ({
            ...prev,
            rawDescription: (prev.rawDescription ? prev.rawDescription + ' ' : '') + finalTranscript.trim()
          }));
        }
        setInterimText(interimTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech Recognition Error", event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setState(prev => ({ ...prev, error: "Microphone permission denied. Please allow access in browser." }));
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimText('');
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setState(prev => ({ ...prev, error: "Voice input not supported in this browser." }));
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setIsListening(true);
      recognitionRef.current.start();
    }
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
        setState(prev => ({ 
          ...prev, 
          originalImages: [...prev.originalImages, ...newImages], 
          error: null 
        }));
      });
    }
  };

  const removeImage = (index: number) => {
    setState(prev => ({
      ...prev,
      originalImages: prev.originalImages.filter((_, i) => i !== index)
    }));
  };

  const runPipeline = async () => {
    if (state.originalImages.length === 0) {
      setState(prev => ({ ...prev, error: "Please upload at least one product photo." }));
      return;
    }

    setState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      statusMessage: `🤖 Analyzing ${state.originalImages.length} photo perspective(s)...`,
      error: null,
      variants: [],
      listing: null
    }));

    try {
      const listing = await generateProfessionalListing(state.originalImages, state.rawDescription);
      setState(prev => ({ ...prev, listing, statusMessage: '🎨 Rendering Studio Variant...' }));

      const variantTypes: ('Studio' | 'Lifestyle' | 'Contextual')[] = ['Studio', 'Lifestyle', 'Contextual'];
      const newVariants: GeneratedVariant[] = [];

      // Use the first image as the primary reference for variants
      const primaryImage = state.originalImages[0];

      for (const type of variantTypes) {
        setState(prev => ({ ...prev, statusMessage: `🎨 Rendering HD ${type} variant...` }));
        const imageUrl = await generateImageVariant(primaryImage, type, listing.title);
        
        const variant: GeneratedVariant = {
          id: Math.random().toString(36).substr(2, 9),
          url: imageUrl,
          type,
          prompt: `Professional ${type} variant`
        };
        newVariants.push(variant);
        setState(prev => ({ ...prev, variants: [...newVariants] }));
      }

      setState(prev => ({ ...prev, isProcessing: false, statusMessage: '✅ Pipeline Ready' }));
    } catch (err: any) {
      console.error("Pipeline Error:", err);
      setState(prev => ({ ...prev, isProcessing: false, error: err.message || "Pipeline failed" }));
    }
  };

  return (
    <div className={`flex min-h-screen font-sans transition-colors duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#f8fafc] text-slate-900'}`}>
      
      {/* Sidebar */}
      <aside className={`w-[360px] p-8 flex flex-col gap-8 border-r transition-colors duration-300 shadow-xl z-10 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff4b4b] p-2 rounded-lg">
              <i className="fas fa-bolt text-white text-xl"></i>
            </div>
            <h1 className="text-2xl font-black tracking-tighter uppercase">ProductPro</h1>
          </div>
          <button 
            onClick={() => setIsDark(!isDark)}
            className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-slate-800 text-amber-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            title="Toggle Dark Mode"
          >
            <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
          </button>
        </div>

        <section>
          <label className={`block text-sm font-bold mb-3 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Step 1: Product Photos</label>
          <div className={`p-5 border-2 border-dashed rounded-xl transition-all group ${isDark ? 'bg-slate-800 border-slate-700 hover:border-[#ff4b4b]' : 'bg-slate-50 border-slate-200 hover:border-[#ff4b4b]'}`}>
            <input 
              type="file" 
              accept="image/*" 
              multiple
              onChange={handleFileChange} 
              className={`text-xs w-full cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-[#ff4b4b] file:text-white hover:file:bg-[#e63939] ${isDark ? 'text-slate-400' : 'text-slate-600'}`} 
            />
            
            {state.originalImages.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {state.originalImages.map((img, idx) => (
                  <div key={idx} className="relative group/thumb">
                    <img src={img} className={`rounded-lg border-2 shadow-sm w-full h-24 object-cover transition-colors ${isDark ? 'border-slate-700 bg-slate-900' : 'border-white bg-white'}`} alt={`Product ${idx}`} />
                    <button 
                      onClick={() => removeImage(idx)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                    {idx === 0 && (
                      <div className="absolute bottom-1 left-1 bg-blue-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold">Primary</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {state.originalImages.length > 0 && (
            <p className={`text-[10px] mt-2 font-bold italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <i className="fas fa-camera-retro mr-1"></i> {state.originalImages.length} images uploaded. AI will analyze all angles.
            </p>
          )}
        </section>

        <section>
          <div className="flex justify-between items-center mb-3">
            <label className={`block text-sm font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Step 2: Description</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setState(prev => ({...prev, rawDescription: ''}))}
                className={`text-[10px] font-bold transition-colors uppercase ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Clear
              </button>
              <button 
                onClick={toggleListening}
                className={`text-[10px] px-3 py-1 rounded-full font-bold flex items-center gap-1.5 transition-all shadow-sm ${isListening ? 'bg-red-500 text-white ring-4 ring-red-100 animate-pulse' : (isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}`}
              >
                <i className={`fas ${isListening ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                {isListening ? 'LISTENING...' : 'VOICE'}
              </button>
            </div>
          </div>
          
          <div className="relative">
            <textarea
              value={state.rawDescription}
              onChange={(e) => setState(prev => ({ ...prev, rawDescription: e.target.value }))}
              placeholder="Dictate features like brand, material, and color..."
              className={`w-full rounded-xl border-2 p-4 text-sm h-32 focus:border-[#ff4b4b] focus:ring-0 outline-none transition-all shadow-inner font-medium block ${isDark ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600' : 'bg-white border-slate-100 text-slate-900 placeholder-slate-400'}`}
            />
            {interimText && (
              <div className={`absolute bottom-2 left-4 right-4 backdrop-blur-sm p-2 rounded-lg border text-[11px] italic font-medium animate-pulse ${isDark ? 'bg-slate-900/90 border-red-900 text-red-400' : 'bg-white/90 border-red-100 text-red-500'}`}>
                Hearing: "{interimText}..."
              </div>
            )}
          </div>
        </section>

        <button
          onClick={runPipeline}
          disabled={state.isProcessing}
          className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all transform active:scale-95 shadow-xl ${
            state.isProcessing 
            ? (isDark ? 'bg-slate-800 text-slate-600' : 'bg-slate-200 text-slate-400') + ' cursor-not-allowed' 
            : 'bg-[#ff4b4b] text-white hover:bg-[#e63939] hover:shadow-red-200'
          }`}
        >
          {state.isProcessing ? (
            <span className="flex items-center justify-center gap-3">
              <i className="fas fa-circle-notch fa-spin"></i> Processing...
            </span>
          ) : '🚀 Start Pipeline'}
        </button>

        {state.error && (
          <div className={`border p-4 rounded-xl flex gap-3 ${isDark ? 'bg-red-950/20 border-red-900' : 'bg-red-50 border-red-100'}`}>
            <i className="fas fa-exclamation-circle text-red-500 mt-1"></i>
            <div className={`text-[11px] font-bold leading-tight ${isDark ? 'text-red-400' : 'text-red-600'}`}>{state.error}</div>
          </div>
        )}

        <div className={`mt-auto pt-8 border-t text-[10px] font-bold flex justify-between tracking-widest uppercase transition-colors ${isDark ? 'border-slate-800 text-slate-600' : 'border-slate-100 text-slate-400'}`}>
          <span>Flipkart Optimized</span>
          <span>v1.6.0</span>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 overflow-y-auto px-12 py-16 scroll-smooth">
        <div className="max-w-[850px] mx-auto">
          
          <StHeader isDark={isDark}>Product Asset Pipeline</StHeader>
          <p className={`font-medium -mt-4 mb-12 text-lg transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Generate high-conversion, marketplace-ready assets from multiple angles.</p>

          {!state.isProcessing && !state.listing && (
            <div className={`border-2 border-dashed rounded-3xl p-32 text-center shadow-sm transition-all ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 transition-colors ${isDark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                <i className={`fas fa-layer-group text-3xl transition-colors ${isDark ? 'text-slate-700' : 'text-slate-300'}`}></i>
              </div>
              <p className={`font-bold text-xl tracking-tight transition-colors ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>System Idle. Awaiting pipeline triggers.</p>
              <p className={`text-sm mt-2 transition-colors ${isDark ? 'text-slate-700' : 'text-slate-300'}`}>Upload multiple product photos and describe them in the left panel.</p>
            </div>
          )}

          {state.isProcessing && <StInfo isDark={isDark}>{state.statusMessage}</StInfo>}
          
          {state.listing && (
            <div className="animate-in fade-in slide-in-from-bottom-10 duration-700">
              <StSuccess isDark={isDark}>Multi-Angle Flipkart Catalog Draft Created</StSuccess>
              
              <div className={`border rounded-2xl p-8 shadow-xl mb-12 relative overflow-hidden transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className={`absolute top-0 right-0 p-4 opacity-5 transition-colors ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                   <i className="fas fa-shopping-cart text-8xl"></i>
                </div>

                <div className="relative z-10">
                  <h3 className="text-[10px] font-black text-[#ff4b4b] uppercase tracking-[0.2em] mb-2">Marketplace Title</h3>
                  <h2 className={`text-2xl font-black leading-tight mb-6 transition-colors ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{state.listing.title}</h2>
                  
                  <div className="prose prose-slate max-w-none">
                    <h3 className="text-[10px] font-black text-[#ff4b4b] uppercase tracking-[0.2em] mb-2">Professional Description</h3>
                    <p className={`text-lg leading-relaxed font-medium p-5 rounded-xl border italic transition-colors ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                      "{state.listing.description}"
                    </p>
                    
                    <StSubheader isDark={isDark}><i className="fas fa-star text-amber-400"></i> Highlights & Key Features</StSubheader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                      {state.listing.keyFeatures.map((f, i) => (
                        <div key={i} className={`flex items-center gap-3 border p-4 rounded-xl shadow-sm hover:shadow-md transition-all ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-colors ${isDark ? 'bg-green-900 text-green-400' : 'bg-green-100 text-green-600'}`}>
                            <i className="fas fa-check"></i>
                          </div>
                          <span className={`text-sm font-bold transition-colors ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{f}</span>
                        </div>
                      ))}
                    </div>

                    <StSubheader isDark={isDark}><i className="fas fa-list-ul text-blue-400"></i> Technical Specifications</StSubheader>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
                      {state.listing.specifications.map((spec, i) => (
                        <div key={i} className={`p-4 rounded-xl border transition-all cursor-default shadow-sm group ${isDark ? 'bg-slate-950 border-slate-800 hover:border-[#ff4b4b]' : 'bg-white border-slate-100 hover:border-[#ff4b4b]'}`}>
                          <span className={`text-[9px] font-black uppercase block tracking-widest mb-1 group-hover:text-[#ff4b4b] transition-colors ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{spec.key}</span>
                          <span className={`text-sm font-black transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{spec.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <StExpander title="JSON API Response (Payload for Pipeline)" isDark={isDark}>
                <pre className={`text-[11px] p-6 rounded-xl overflow-x-auto shadow-2xl font-mono leading-relaxed transition-colors ${isDark ? 'bg-slate-950 text-green-500' : 'bg-slate-900 text-green-400'}`}>
                  {JSON.stringify(state.listing, null, 2)}
                </pre>
              </StExpander>
            </div>
          )}

          {state.variants.length > 0 && (
            <div className="mt-20 animate-in fade-in slide-in-from-top-10 duration-1000">
              <div className="flex justify-between items-end mb-8">
                <div>
                  <StSubheader isDark={isDark}><i className="fas fa-images text-[#ff4b4b]"></i> Generated HD Gallery</StSubheader>
                  <p className={`text-sm font-medium transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Enhanced variants generated using your primary photo.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-16">
                {state.variants.map((variant) => (
                  <div key={variant.id} className={`rounded-3xl border shadow-2xl overflow-hidden hover:scale-[1.01] transition-all duration-500 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                    <div className={`p-6 border-b flex justify-between items-center transition-colors ${isDark ? 'bg-slate-800/50 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-[#ff4b4b] rounded-full animate-pulse"></div>
                        <span className={`text-sm font-black tracking-tighter uppercase transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {variant.type} HD Catalog View
                        </span>
                      </div>
                      <button 
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = variant.url;
                          link.download = `Flipkart_${variant.type}_${Date.now()}.png`;
                          link.click();
                        }}
                        className={`text-[10px] px-6 py-2.5 rounded-full border hover:bg-[#ff4b4b] hover:text-white hover:border-[#ff4b4b] font-black transition-all shadow-md flex items-center gap-2 ${isDark ? 'bg-slate-700 text-slate-100 border-slate-600' : 'bg-white text-slate-900 border-slate-200'}`}
                      >
                        <i className="fas fa-cloud-download-alt"></i> DOWNLOAD ASSET
                      </button>
                    </div>
                    <img src={variant.url} alt={variant.type} className={`w-full object-cover aspect-square transition-colors ${isDark ? 'bg-slate-950' : 'bg-white'}`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {state.isProcessing && state.variants.length < 3 && state.listing && (
             <div className={`flex flex-col items-center justify-center p-32 mt-12 border-4 border-dotted rounded-[40px] shadow-sm animate-pulse transition-all ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                <div className="relative mb-8">
                  <div className="w-20 h-20 border-4 border-[#ff4b4b] border-t-transparent rounded-full animate-spin"></div>
                  <i className="fas fa-wand-magic-sparkles absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-[#ff4b4b]"></i>
                </div>
                <p className={`font-black text-xl uppercase tracking-widest transition-colors ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Rendering {['Studio', 'Lifestyle', 'Contextual'][state.variants.length]} Vision...</p>
                <p className={`text-sm mt-2 font-bold italic transition-colors ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Applying Flipkart aesthetic standards...</p>
             </div>
          )}
          
        </div>
      </main>
    </div>
  );
};

export default App;
