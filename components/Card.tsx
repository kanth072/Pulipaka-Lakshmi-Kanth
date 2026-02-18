import React from 'react';

export const Card = ({
  children,
  isDark,
  title,
  className = '',
}: {
  children?: React.ReactNode;
  isDark: boolean;
  title?: string;
  className?: string;
}) => (
  <div
    className={`p-6 md:p-8 rounded-2xl border transition-all ${
      isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100 shadow-sm'
    } ${className}`}
  >
    {title && (
      <h3 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
        <div className="w-1 h-3 bg-red-500 rounded-full" /> {title}
      </h3>
    )}
    {children}
  </div>
);
