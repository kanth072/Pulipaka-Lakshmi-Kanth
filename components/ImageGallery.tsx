import React from 'react';
import { GeneratedVariant } from '../types';
import { Badge } from './Badge';

interface ImageGalleryProps {
  variants: GeneratedVariant[];
  isProcessing: boolean;
  isDark: boolean;
}

const downloadImage = (url: string, filename: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
};

export const ImageGallery: React.FC<ImageGalleryProps> = ({
  variants,
  isProcessing,
  isDark,
}) => {
  const types: ('Studio' | 'Lifestyle' | 'Contextual')[] = [
    'Studio',
    'Lifestyle',
    'Contextual',
  ];

  const iconMap = {
    Studio: 'fa-cube',
    Lifestyle: 'fa-home',
    Contextual: 'fa-search-plus',
  };

  return (
    <section className="space-y-8">
      <div
        className={`flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pb-6 border-b-2 ${
          isDark ? 'border-slate-800' : 'border-slate-100'
        }`}
      >
        <h3 className="text-2xl md:text-3xl font-extrabold uppercase tracking-tight flex items-center gap-4">
          <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white text-lg shadow-lg shadow-red-500/30">
            <i className="fas fa-layer-group"></i>
          </div>
          Visual Library
        </h3>
        <Badge color="blue">{variants.length} Renders</Badge>
      </div>

      <div className="grid grid-cols-1 gap-12">
        {types.map((type) => {
          const v = variants.find((item) => item.type === type);
          return (
            <div
              key={type}
              className={`rounded-2xl overflow-hidden border-2 transition-all group relative flex flex-col animate-fade-in ${
                isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'
              }`}
            >
              {v ? (
                <>
                  {/* Image header */}
                  <div
                    className={`p-4 md:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b ${
                      isDark ? 'border-slate-800' : 'border-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                        <i className={`fas ${iconMap[type]}`}></i>
                      </div>
                      <div>
                        <span className="text-sm font-extrabold uppercase tracking-widest text-red-500 block leading-none">
                          {type}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Production Ready
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadImage(v.url, `${type.toLowerCase()}-variant.png`)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                        isDark
                          ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <i className="fas fa-download"></i>
                      Download HD
                    </button>
                  </div>

                  {/* Image */}
                  <div className="aspect-square bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    <img
                      src={v.url}
                      alt={`${type} variant of the product`}
                      className="w-full h-full object-cover transition-transform duration-[3000ms] group-hover:scale-105 ease-out"
                    />
                  </div>
                </>
              ) : (
                <div
                  className={`flex flex-col items-center justify-center py-20 gap-4 ${
                    isDark ? 'text-slate-600' : 'text-slate-300'
                  }`}
                >
                  <i
                    className={`fas ${
                      isProcessing ? 'fa-spinner fa-spin' : iconMap[type]
                    } text-4xl`}
                  ></i>
                  <span className="text-sm font-extrabold uppercase tracking-widest">
                    {isProcessing ? `Generating ${type}...` : `${type} Pending`}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
