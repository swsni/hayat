import React, { useState } from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  withBorder?: boolean;
}

export default function Logo({ className = '', size = 'md', withBorder = false }: LogoProps) {
  const [imageError, setImageError] = useState(false);

  // Dimensions based on size preset
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-20 h-20',
    lg: 'w-36 h-36',
    xl: 'w-48 h-48'
  };

  return (
    <div 
      id="brand-logo-container" 
      className={`relative flex items-center justify-center rounded-full overflow-hidden transition-all duration-300 ${sizeClasses[size]} ${withBorder ? 'border-2 border-brand-olive p-1' : ''} ${className}`}
    >
      {!imageError ? (
        <img 
          id="brand-logo-img"
          src="/logoo.png" 
          alt="Brand Logo" 
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-opacity duration-500 ease-in-out"
          onError={() => setImageError(true)}
        />
      ) : (
        /* Elite calligraphic SVG representation resembling the uploaded logo */
        <div 
          id="brand-logo-fallback"
          className="w-full h-full bg-brand-olive flex items-center justify-center p-2 rounded-full shadow-inner select-none animate-fade-in"
        >
          <svg 
            viewBox="0 0 100 100" 
            className="w-4/5 h-4/5 text-white" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="3.5"
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            {/* Elegant luxury abstract arabesque curves representing the brand's monogram calligraphy */}
            <path 
              d="M 50,15 C 38,20 25,35 25,52 C 25,72 40,85 50,85 C 60,85 75,70 75,52 C 75,34 62,25 50,15 Z" 
              strokeWidth="2.5"
            />
            <path 
              d="M 40,30 Q 50,55 60,30 Q 70,55 50,75 Q 30,55 40,30" 
              className="opacity-90"
              strokeWidth="2"
            />
            <path 
              d="M 50,15 L 50,85" 
              strokeWidth="1.5"
              strokeDasharray="2 3"
              className="opacity-60"
            />
            <circle cx="50" cy="50" r="2" fill="white" />
          </svg>
        </div>
      )}
    </div>
  );
}
