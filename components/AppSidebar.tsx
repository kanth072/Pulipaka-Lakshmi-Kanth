import React, { useState, useRef } from 'react';
import { AppState } from '../types';

interface SidebarProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  isDark: boolean;
  setIsDark: (v: boolean) => void;
  isListening: boolean;
  toggleListening: () => void;
  onRunPipeline: () => void;
  isMobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

export const AppSidebar: React.FC<SidebarProps> = ({
  state,
  setState,
  isDark,
  setIsDark,
  isListening,
  toggleListening,
  onRunPipeline,
  isMobileOpen,
  setMobileOpen,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList) => {
    const fileList = Array.from(files);
    const readPromises = fileList
      .filter((f) => f.type.startsWith('image/'))
      .map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.readAsDataURL(file as Blob);
          })
      );
    Promise.all(readPromises).then((base64Images) => {
      setState((prev) => ({
        ...prev,
        originalImages: [...prev.originalImages, ...base64Images],
      }));
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  const removeImage = (idx: number) => {
    setState((p) => ({
      ...p,
      originalImages: p.originalImages.filter((_, i) => i !== idx),
    }));
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed lg:sticky top-0 left-0 h-screen z-50 w-[340px] md:w-[360px]
          flex flex-col border-r overflow-y-auto
          transition-transform duration-300
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}
        `}
      >
        <div className="p-6 md:p-8 flex flex-col gap-8 flex-1">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-red-500 p-2.5 rounded-xl shadow-lg shadow-red-500/20">
                <i className="fas fa-bolt text-white text-base"></i>
              </div>
              <h1 className="text-xl font-extrabold uppercase tracking-tight">
                ProductPro
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDark(!isDark)}
                className={`p-2.5 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                }`}
                aria-label="Toggle theme"
              >
                <i
                  className={`fas ${
                    isDark ? 'fa-sun text-amber-400' : 'fa-moon text-slate-400'
                  }`}
                ></i>
              </button>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2.5 rounded-lg lg:hidden hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close sidebar"
              >
                <i className="fas fa-times text-slate-400"></i>
              </button>
            </div>
          </div>

          {/* Upload Area */}
          <div className="space-y-3">
            <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-1">
              Product Photos
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-3 min-h-[120px] ${
                dragOver
                  ? 'border-red-500 bg-red-500/5'
                  : isDark
                  ? 'bg-slate-800/50 border-slate-700 hover:border-red-500/50'
                  : 'bg-slate-50 border-slate-200 hover:border-red-500/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <i
                className={`fas fa-cloud-upload-alt text-2xl transition-colors ${
                  dragOver ? 'text-red-500' : 'text-slate-300'
                }`}
              ></i>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                Drop images or click to upload
              </p>
            </div>

            {state.originalImages.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {state.originalImages.map((img, idx) => (
                  <div key={idx} className="relative aspect-square group">
                    <img
                      src={img}
                      className={`w-full h-full object-cover rounded-lg border ${
                        isDark ? 'border-slate-700' : 'border-slate-200'
                      }`}
                      alt={`Product photo ${idx + 1}`}
                    />
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white w-5 h-5 rounded-full text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      aria-label={`Remove photo ${idx + 1}`}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Description / Dictation */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Product Details
              </label>
              <button
                onClick={toggleListening}
                className={`text-[9px] font-extrabold px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse-glow'
                    : isDark
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <i
                  className={`fas ${
                    isListening ? 'fa-microphone-slash' : 'fa-microphone'
                  }`}
                ></i>{' '}
                {isListening ? 'STOP' : 'DICTATE'}
              </button>
            </div>
            <div className="relative">
              <textarea
                value={state.rawDescription}
                onChange={(e) =>
                  setState((p) => ({ ...p, rawDescription: e.target.value }))
                }
                placeholder="Describe features, brand, selling points..."
                className={`w-full h-48 p-4 rounded-2xl border-2 text-sm focus:border-red-500 outline-none transition-all resize-none leading-relaxed ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white placeholder:text-slate-600'
                    : 'bg-slate-50/50 border-slate-100 placeholder:text-slate-400'
                }`}
              />
              {isListening && (
                <div className="absolute bottom-4 right-4 flex gap-1 items-center">
                  <div
                    className="w-0.5 h-3 bg-red-500 animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <div
                    className="w-0.5 h-4 bg-red-500 animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <div
                    className="w-0.5 h-3 bg-red-500 animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Execute button - pinned at bottom */}
        <div
          className={`p-6 md:p-8 border-t ${
            isDark ? 'border-slate-800' : 'border-slate-100'
          }`}
        >
          <button
            onClick={onRunPipeline}
            disabled={state.isProcessing}
            className={`w-full py-4 rounded-2xl font-extrabold text-sm uppercase tracking-widest transition-all active:scale-[0.98] ${
              state.isProcessing
                ? isDark
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/25'
            }`}
          >
            {state.isProcessing ? (
              <>
                <i className="fas fa-sync fa-spin mr-2"></i> Processing...
              </>
            ) : (
              'Execute Pipeline'
            )}
          </button>
          {state.error && (
            <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-semibold flex gap-3 animate-fade-in">
              <i className="fas fa-exclamation-triangle mt-0.5 shrink-0"></i>
              <p>{state.error}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
