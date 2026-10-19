import { useState } from 'react';
import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ObfuscatedEmailProps {
  email: string;
  /** Button text and hint in the page's language (legal pages follow their URL). */
  label: string;
  hint: string;
  className?: string;
}

/**
 * Renders a contact email in a scraper-resistant but legally-effective way.
 *
 * The real address and `mailto:` link are assembled in JavaScript only after a
 * user interaction (a single click), so the plaintext address is NOT present in
 * the initial rendered DOM that naive email harvesters read. A human still
 * reaches the operator with one click, which keeps the contact "direct and
 * effective" as German/EU law requires.
 *
 * Honest limitation: this is a static client-side app, so the configured
 * address still exists as a string inside the JavaScript bundle. Perfect
 * hiding is impossible without a server; this only defeats DOM/HTML scraping,
 * which is what casual spam bots actually do.
 */
export const ObfuscatedEmail = ({ email, label, hint, className }: ObfuscatedEmailProps) => {
  const [revealed, setRevealed] = useState(false);

  // Split so the full address is never built until it is needed.
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === email.length - 1) {
    // Not a plausible email — render verbatim rather than guess.
    return <span className={className}>{email}</span>;
  }
  const user = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (!revealed) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className={cn(
          'inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-2 hover:decoration-solid',
          className,
        )}
        title={hint}
      >
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </button>
    );
  }

  const address = `${user}@${domain}`;
  return (
    <a className={cn('underline', className)} href={`mailto:${address}`}>
      {address}
    </a>
  );
};
