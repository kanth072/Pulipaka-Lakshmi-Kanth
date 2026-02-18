import React from 'react';
import { ProductListing } from '../types';
import { StCard } from './UIComponents';

interface ListingDisplayProps {
  listing: ProductListing;
  isDark: boolean;
}

export const ListingDisplay = React.memo(({ listing, isDark }: ListingDisplayProps) => (
  <StCard isDark={isDark} title="Generated Copywriting">
    <div className="flex justify-between items-start mb-16 border-b dark:border-slate-800 pb-12">
      <div className="flex-1 pr-20">
        <span className="text-[11px] font-black text-red-500 uppercase tracking-[0.5em] block mb-4">Product Catalog Title</span>
        <h2 className={`text-5xl font-black leading-[1.1] tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {listing.title}
        </h2>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
      <div className="lg:col-span-8 space-y-12">
        <p
          className={`text-3xl leading-[1.4] italic font-medium p-14 rounded-[4rem] border shadow-2xl ${
            isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          &ldquo;{listing.description}&rdquo;
        </p>
        <div className="grid grid-cols-1 gap-4">
          {listing.keyFeatures.map((f, i) => (
            <div
              key={i}
              className={`flex items-center gap-6 text-xl font-bold p-8 rounded-3xl border transition-colors ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-50 shadow-md'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 shrink-0">
                <i className="fas fa-check"></i>
              </div>
              {f}
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-4 space-y-8">
        <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Technical Data</h4>
        <div className="flex flex-col gap-4">
          {listing.specifications.map((s, i) => (
            <div
              key={i}
              className={`p-8 border rounded-[2.5rem] flex flex-col gap-2 transition-colors ${
                isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-white shadow-lg'
              }`}
            >
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.key}</span>
              <span className="text-lg font-black tracking-tight">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </StCard>
));
ListingDisplay.displayName = 'ListingDisplay';
