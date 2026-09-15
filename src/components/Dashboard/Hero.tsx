import React from 'react';
import { Search, Heart, Share2, Tags } from 'lucide-react';

interface HeroProps {
  onFocusSearch: () => void;
  onGoToFavorites: () => void;
  onGoToCategories: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onFocusSearch, onGoToFavorites, onGoToCategories }) => {
  const [copied, setCopied] = React.useState(false);

  const handleShare = async () => {
    const shareData = { title: 'Acordes de Fe · Cancionero', url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // user cancelled or share unsupported — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  };

  const actions = [
    { label: 'Buscar', icon: Search, onClick: onFocusSearch },
    { label: 'Favoritas', icon: Heart, onClick: onGoToFavorites },
    { label: copied ? 'Enlace copiado' : 'Compartir', icon: Share2, onClick: handleShare },
    { label: 'Categorías', icon: Tags, onClick: onGoToCategories },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#10203A] px-6 sm:px-10 py-8 sm:py-10 mb-8">
      {/* Subtle geometric texture, no photography */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.06]"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <pattern id="hero-grid" width="42" height="42" patternUnits="userSpaceOnUse">
            <path d="M 42 0 L 0 0 0 42" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
      </svg>

      <div className="relative">
        <span className="text-[11px] font-bold text-blue-300 tracking-wider uppercase mb-3 block">
          Ministerio
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">
          Tu cancionero
        </h1>
        <p className="text-sm text-slate-300 max-w-lg mb-6">
          Letras, acordes y tonos listos para acompañar cada encuentro.
        </p>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {actions.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-semibold transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
