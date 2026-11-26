import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ApplicationStatus, WatchStatus } from '../../types';
import { cn } from '../../lib/utils';

const badgeVariants = cva('inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      success: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
      error: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
      warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
      info: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
      neutral: 'bg-[var(--color-neutral-bg)] text-[var(--color-neutral-text)]',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

type BadgeProps = Readonly<{
  className?: string;
  children: ReactNode;
}> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, children }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}

function titleCase(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'connected':
    case 'active': {
      return 'success';
    }
    case 'error': {
      return 'error';
    }
    case 'draft':
    case 'stopped': {
      return 'warning';
    }
    default: {
      return 'neutral';
    }
  }
}

export function ConnectionBadge({ status }: Readonly<{ status: ApplicationStatus }>) {
  return <Badge variant={statusVariant(status)}>{titleCase(status)}</Badge>;
}

export function WatchBadge({ status }: Readonly<{ status: WatchStatus }>) {
  return <Badge variant={statusVariant(status)}>{status === 'none' ? 'Not monitoring' : titleCase(status)}</Badge>;
}
