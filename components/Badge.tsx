import React from 'react';

const colorMap = {
  red: 'bg-red-500/10 text-red-500',
  blue: 'bg-blue-500/10 text-blue-500',
  green: 'bg-green-500/10 text-green-500',
  amber: 'bg-amber-500/10 text-amber-500',
};

type BadgeColor = keyof typeof colorMap;

export const Badge = ({
  children,
  color = 'red',
}: {
  children?: React.ReactNode;
  color?: BadgeColor;
}) => (
  <span
    className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-widest ${colorMap[color]}`}
  >
    {children}
  </span>
);
