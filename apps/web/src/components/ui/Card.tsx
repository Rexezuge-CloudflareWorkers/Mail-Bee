import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type CardProps = Readonly<{
  className?: string;
  children: ReactNode;
}>;

export function Card({ className, children }: CardProps) {
  return <div className={cn('rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5', className)}>{children}</div>;
}

export function CardHeader({ className, children }: CardProps) {
  return <div className={cn('mb-4 flex items-center justify-between', className)}>{children}</div>;
}

export function CardTitle({ className, children }: CardProps) {
  return <h2 className={cn('text-lg font-semibold text-[var(--color-text-primary)]', className)}>{children}</h2>;
}
