import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  alt?: string;
}

export const BrandLogo = ({ className, alt = 'LWrite' }: BrandLogoProps) => (
  <img
    src="/favicon.svg"
    alt={alt}
    width={20}
    height={20}
    className={cn('h-5 w-5 shrink-0', className)}
  />
);
