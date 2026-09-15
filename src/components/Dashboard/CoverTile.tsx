import React from 'react';
import { getCategoryStyle } from '../../utils/categoryStyle';

interface CoverTileProps {
  category?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: { box: 'w-10 h-10 rounded-lg', icon: 'w-4 h-4' },
  md: { box: 'w-14 h-14 rounded-xl', icon: 'w-6 h-6' },
  lg: { box: 'w-full aspect-[4/3] rounded-lg', icon: 'w-9 h-9' },
};

export const CoverTile: React.FC<CoverTileProps> = ({ category, size = 'sm', className = '' }) => {
  const style = getCategoryStyle(category);
  const Icon = style.icon;
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <div
      className={`bg-gradient-to-br ${style.from} ${style.to} flex items-center justify-center flex-shrink-0 ${sizeClasses.box} ${className}`}
      aria-hidden="true"
    >
      <Icon className={`${sizeClasses.icon} text-white/90`} strokeWidth={1.75} />
    </div>
  );
};
