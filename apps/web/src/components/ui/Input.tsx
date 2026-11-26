import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Input({ className, ...props }: Readonly<InputHTMLAttributes<HTMLInputElement>>) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors duration-150 focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: Readonly<SelectHTMLAttributes<HTMLSelectElement>>) {
  return (
    <select
      className={cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2 text-[var(--color-text-primary)] transition-colors duration-150 focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, children, ...props }: Readonly<LabelHTMLAttributes<HTMLLabelElement>>) {
  return (
    <label className={cn('block text-sm text-[var(--color-text-secondary)]', className)} {...props}>
      {children}
    </label>
  );
}
