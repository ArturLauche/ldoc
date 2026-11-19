import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  title?: string;
}

/**
 * Uses the same asset as the favicon so the tab icon and in-app logo stay
 * visually identical.
 */
export const BrandLogo = ({ className, title = 'LWrite' }: BrandLogoProps) => (
  <img
    src="/favicon.svg"
    alt={title}
    width={20}
    height={20}
    className={cn('h-5 w-5 shrink-0 rounded-[0.35rem]', className)}
  />
);
