import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }) => {
  const sizeMap = {
    sm: { icon: 'w-7 h-7', text: 'text-base font-bold', sub: 'text-[10px]' },
    md: { icon: 'w-10 h-10', text: 'text-lg font-bold', sub: 'text-xs' },
    lg: { icon: 'w-14 h-14', text: 'text-2xl font-extrabold', sub: 'text-sm' },
    xl: { icon: 'w-20 h-20', text: 'text-3xl font-black', sub: 'text-base' },
  };

  const { icon, text, sub } = sizeMap[size];

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <div className={`${icon} rounded-xl overflow-hidden shadow-sm flex-shrink-0 bg-[#FAF7EF] border border-[#176B4D]/15`}>
        <img
          src="/logo.svg"
          alt="Namma Ooru Workers"
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className={`${text} text-[#176B4D] tracking-tight flex items-center gap-1.5`}>
            Namma Ooru <span className="text-[#E8B83D] font-black">Workers</span>
          </span>
          <span className={`${sub} text-[#586B63] font-medium tracking-wide`}>
            நம் ஊரு ஒர்க்கர்ஸ்
          </span>
        </div>
      )}
    </div>
  );
};
