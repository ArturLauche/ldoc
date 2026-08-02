import { useId } from 'react';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  title?: string;
}

/**
 * Inline brand mark matching `public/favicon.svg` so the tab icon and
 * in-app logo stay visually identical.
 */
export const BrandLogo = ({ className, title = 'LWrite' }: BrandLogoProps) => {
  const uid = useId().replace(/:/g, '');
  const bgId = `lwrite-bg-${uid}`;
  const accentId = `lwrite-accent-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={cn('h-5 w-5 flex-shrink-0 rounded-[0.35rem]', className)}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id={accentId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="14" fill={`url(#${bgId})`} />
      <path
        d="M20 16v31c0 1.7 1.3 3 3 3h19"
        fill="none"
        stroke="#f8fafc"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M39 18l9 9-6 6-9-9z" fill={`url(#${accentId})`} />
      <path d="M31 26l7 7-4.3 1.3z" fill="#67e8f9" />
    </svg>
  );
};
