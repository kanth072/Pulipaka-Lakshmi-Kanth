import React, { useCallback } from 'react';
import { GeneratedVariant } from '../types';
import { Badge } from './UIComponents';

interface VariantGalleryProps {
  variants: GeneratedVariant[];
  isDark: boolean;
  isProcessing: boolean;
}

const VARIANT_TYPES = ['Studio', 'Lifestyle', 'Contextual'] as const;

const VariantCard = React.memo(
  ({ type, variant, isDark, isProcessing }: { type: string; variant?: GeneratedVariant; isDark: boolean; isProcessing: boolean }) => {
    const handleDownload = useCallback(() => {
      if (!variant) return;
      const a = document.createElement('a');
      a.href = variant.url;
      a.download = `${variant.type}.png`;
      a.click();
    }, [variant]);

    return (
      <div
        className={`rounded-[5rem] overflow-hidden shadow-2xl border-4 transition-colors ${
          isDark ? 'border-slate-800 bg-black' : 'border-slate-100 bg-white'
        } group relative min-h-[500px] flex flex-col`}
      >
        {variant ? (
          <>
            <div className="absolute top-12 right-12 z-30 opacity-0 group-hover:opacity-100 transition-opacity flex gap-4">
              <button
                onClick={handleDownload}
                className="bg-white px-10 py-5 rounded-full text-xs font-black text-slate-900 shadow-2xl flex items-center gap-4 hover:bg-red-500 hover:text-white transition-colors active:scale-90"
              >
                <i className="fas fa-cloud-download-alt"></i> EXPORT HD
              </button>
            </div>
            <div className="p-12 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b-4 dark:border-slate-800 flex justify-between items-center px-24 relative z-10">
              <div className="flex items-center gap-10">
                <div className="w-16 h-16 rounded-[1.5rem] bg-red-500/10 flex items-center justify-center text-red-500 text-3xl font-black">
                  {variant.type[0]}
                </div>
                <div>
                  <span className="text-xl font-black uppercase tracking-[0.5em] text-red-500 block leading-none mb-1">
                    {variant.type} PERSPECTIVE
                  </span>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Master Production Ready</span>
                </div>
              </div>
            </div>
            <div className="aspect-square bg-[#0a0a0a] relative overflow-hidden flex items-center justify-center flex-1">
              <img
                src={variant.url}
                alt={`${variant.type} product view`}
                className="w-full h-full object-cover transition-transform duration-[6000ms] group-hover:scale-110 ease-out"
                loading="lazy"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-20 text-center gap-8">
            <div className="w-24 h-24 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-300">
              <i className={`fas ${isProcessing ? 'fa-spinner fa-spin' : 'fa-image'} text-5xl opacity-20`}></i>
            </div>
            <h4 className="text-3xl font-black uppercase tracking-tighter opacity-20">{type} Perspective Synchronizing</h4>
          </div>
        )}
      </div>
    );
  }
);
VariantCard.displayName = 'VariantCard';

export const VariantGallery = React.memo(({ variants, isDark, isProcessing }: VariantGalleryProps) => (
  <section className="space-y-16">
    <div className="flex justify-between items-end border-b-8 border-slate-100 dark:border-slate-900 pb-12">
      <h3 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-8">
        <div className="w-14 h-14 bg-red-500 rounded-2xl flex items-center justify-center text-white text-2xl shadow-2xl shadow-red-500/40">
          <i className="fas fa-layer-group"></i>
        </div>
        HD Visual Library
      </h3>
      <Badge color="blue">{variants.length} Production Renders</Badge>
    </div>

    <div className="grid grid-cols-1 gap-32">
      {VARIANT_TYPES.map((type) => {
        const v = variants.find((item) => item.type === type);
        return <VariantCard key={type} type={type} variant={v} isDark={isDark} isProcessing={isProcessing} />;
      })}
    </div>
  </section>
));
VariantGallery.displayName = 'VariantGallery';
