import React, { useState } from 'react';
import { ProductListing } from '../types';
import { Card } from './Card';
import { Badge } from './Badge';

interface ListingCardProps {
  listing: ProductListing;
  isDark: boolean;
}

export const ListingCard: React.FC<ListingCardProps> = ({ listing, isDark }) => {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const copyAll = () => {
    const fullText = `${listing.title}\n\n${listing.description}\n\nKey Features:\n${listing.keyFeatures.map((f) => `- ${f}`).join('\n')}\n\nSpecifications:\n${listing.specifications.map((s) => `${s.key}: ${s.value}`).join('\n')}`;
    copyToClipboard(fullText, 'all');
  };

  return (
    <Card isDark={isDark} title="Generated Listing">
      {/* Title + Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8 pb-8 border-b border-slate-100 dark:border-slate-800">
        <div className="flex-1">
          <span className="text-[10px] font-extrabold text-red-500 uppercase tracking-[0.4em] block mb-2">
            Product Title
          </span>
          <h2
            className={`text-2xl md:text-3xl lg:text-4xl font-extrabold leading-tight tracking-tight text-balance ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}
          >
            {listing.title}
          </h2>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => copyToClipboard(listing.title, 'title')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              copied === 'title'
                ? 'bg-green-500 text-white'
                : isDark
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <i className={`fas ${copied === 'title' ? 'fa-check' : 'fa-copy'} mr-1.5`}></i>
            Title
          </button>
          <button
            onClick={copyAll}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              copied === 'all'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
          >
            <i className={`fas ${copied === 'all' ? 'fa-check' : 'fa-copy'} mr-1.5`}></i>
            Copy All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Left: Description + Features */}
        <div className="lg:col-span-8 space-y-8">
          {/* Description */}
          <div className="relative group">
            <p
              className={`text-lg md:text-xl leading-relaxed italic font-medium p-6 md:p-8 rounded-2xl border ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-200'
                  : 'bg-slate-50 border-slate-100 text-slate-700'
              }`}
            >
              {'"'}{listing.description}{'"'}
            </p>
            <button
              onClick={() => copyToClipboard(listing.description, 'desc')}
              className={`absolute top-3 right-3 p-2 rounded-lg text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity ${
                copied === 'desc'
                  ? 'bg-green-500 text-white'
                  : isDark
                  ? 'bg-slate-800 text-slate-400'
                  : 'bg-white text-slate-500 shadow-sm'
              }`}
            >
              <i className={`fas ${copied === 'desc' ? 'fa-check' : 'fa-copy'}`}></i>
            </button>
          </div>

          {/* Features */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Key Features
              </span>
              <button
                onClick={() =>
                  copyToClipboard(
                    listing.keyFeatures.map((f) => `- ${f}`).join('\n'),
                    'features'
                  )
                }
                className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${
                  copied === 'features'
                    ? 'bg-green-500 text-white'
                    : isDark
                    ? 'text-slate-500 hover:text-slate-300'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <i className={`fas ${copied === 'features' ? 'fa-check' : 'fa-copy'} mr-1`}></i>
                Copy
              </button>
            </div>
            {listing.keyFeatures.map((f, i) => (
              <div
                key={i}
                className={`flex items-start gap-4 text-sm font-semibold p-4 rounded-xl border transition-all animate-fade-in ${
                  isDark
                    ? 'bg-slate-950 border-slate-800'
                    : 'bg-white border-slate-50 shadow-sm'
                }`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="w-7 h-7 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 shrink-0 mt-0.5">
                  <i className="fas fa-check text-xs"></i>
                </div>
                <span className="leading-relaxed">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Specifications */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
              Specifications
            </h4>
            <button
              onClick={() =>
                copyToClipboard(
                  listing.specifications.map((s) => `${s.key}: ${s.value}`).join('\n'),
                  'specs'
                )
              }
              className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${
                copied === 'specs'
                  ? 'bg-green-500 text-white'
                  : isDark
                  ? 'text-slate-500 hover:text-slate-300'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <i className={`fas ${copied === 'specs' ? 'fa-check' : 'fa-copy'} mr-1`}></i>
              Copy
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {listing.specifications.map((s, i) => (
              <div
                key={i}
                className={`p-4 border rounded-xl flex flex-col gap-1 transition-all animate-fade-in ${
                  isDark
                    ? 'border-slate-800 bg-slate-950'
                    : 'border-slate-100 bg-white shadow-sm'
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                  {s.key}
                </span>
                <span className="text-sm font-bold tracking-tight">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};
