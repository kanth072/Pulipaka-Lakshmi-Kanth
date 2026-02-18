import React from 'react';

export const Badge = React.memo(({ children, color = 'red' }: { children?: React.ReactNode; color?: 'red' | 'blue' | 'green' | 'amber' }) => {
  const colors = {
    red: 'bg-red-500/10 text-red-500',
    blue: 'bg-blue-500/10 text-blue-500',
    green: 'bg-green-500/10 text-green-500',
    amber: 'bg-amber-500/10 text-amber-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${colors[color]}`}>
      {children}
    </span>
  );
});
Badge.displayName = 'Badge';

export const StCard = React.memo(({ children, isDark, title }: { children?: React.ReactNode; isDark: boolean; title?: string }) => (
  <div className={`p-8 rounded-3xl border shadow-sm transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
    {title && (
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
        <div className="w-1 h-3 bg-red-500 rounded-full" /> {title}
      </h3>
    )}
    {children}
  </div>
));
StCard.displayName = 'StCard';
