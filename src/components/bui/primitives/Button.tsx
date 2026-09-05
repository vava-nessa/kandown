/**
 * @file Button primitive of the BeautifulUI design system
 * @description Faithful port of the BeautifulUI atoms/Button used by its
 * components (beautifului.dev, MIT): variants (`ghost`, `accent`, `secondary`,
 * `success`, `primary`, `quiet`) and compact sizes, written against the
 * scoped `.bui` tokens from styles/beautifului.css. `quiet` carries no
 * padding of its own: the size scale provides it, so bars of quiet buttons
 * pack tighter than form footers.
 *
 * @exports Button
 * @see src/components/bui/ApprovalCard.tsx
 * @see src/components/bui/SelectionActions.tsx
 */

import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'ghost' | 'accent' | 'secondary' | 'success' | 'primary' | 'quiet';
type ButtonSize = 'xs' | 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  ghost: 'text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink',
  accent: 'bg-accent text-white shadow-btn transition-all duration-150 hover:brightness-105',
  secondary: 'bg-surface text-ink shadow-btn transition-colors duration-150 hover:bg-hover',
  success: 'bg-green text-white shadow-btn transition-all duration-150 hover:brightness-105',
  primary: 'bg-ink text-surface shadow-hairline transition-opacity duration-150 hover:opacity-90',
  quiet: 'text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'rounded-control px-1.5 py-1 text-[12.5px] font-normal',
  sm: 'rounded-control px-2.5 py-1 text-[12.5px] font-medium',
  md: 'rounded-control px-3 py-1.5 text-[13px] font-medium',
};

export function Button({
  variant = 'ghost',
  size = 'sm',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}
