/**
 * @file Reusable keyboard-aware button
 * @description A unified button component that handles icons, labels, and keyboard
 * shortcuts with consistent styling and improved visibility.
 *
 * 📖 This component replaces various ad-hoc button patterns to ensure that
 * action buttons throughout the app are consistently sized and styled.
 */

import React from 'react';
import { Icon } from './Icons';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';

interface KbdButtonProps {
  onClick?: (e: React.MouseEvent) => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Icon;
  label?: string;
  shortcut?: string;
  title?: string;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  /** 📖 If true, the button will be purely an icon button without label/shortcut */
  isIconOnly?: boolean;
  /** 📖 Custom icon size, defaults to 14 */
  iconSize?: number;
}

export function KbdButton({
  onClick,
  variant = 'secondary',
  icon,
  label,
  shortcut,
  title,
  className = '',
  disabled = false,
  type = 'button',
  isIconOnly = false,
  iconSize = 22,
}: KbdButtonProps) {
  const IconComponent = icon ? Icon[icon] : null;

  // Base classes: h-11 for more presence, larger text
  const baseClasses = "inline-flex items-center justify-center gap-2.5 h-11 px-4 text-[15px] font-semibold rounded-[10px] transition-all duration-150 ease-out whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

  const variantClasses = {
    primary: "bg-primary text-primary-foreground border border-primary hover:bg-primary/90 hover:border-primary/90 shadow-sm",
    secondary: "bg-transparent text-fg border border-border-strong hover:bg-bg-2 hover:border-border-focus",
    ghost: "bg-transparent text-fg-dim border border-transparent hover:bg-bg-2 hover:text-fg",
    danger: "bg-transparent text-danger border border-border-strong hover:bg-danger/10 hover:border-danger",
    icon: "w-11 h-11 p-0 text-fg-dim bg-transparent border border-transparent hover:bg-bg-2 hover:text-fg",
  };

  const kbdStyle = variant === 'primary' 
    ? { color: 'rgba(0,0,0,0.7)', background: 'rgba(0,0,0,0.15)', borderColor: 'rgba(0,0,0,0.2)' }
    : undefined;

  if (isIconOnly || variant === 'icon') {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`${variantClasses.icon} inline-flex items-center justify-center rounded-[10px] transition-all duration-150 ease-out ${className}`}
      >
        {IconComponent && <IconComponent size={iconSize} />}
      </button>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      {IconComponent && <IconComponent size={iconSize} />}
      {label && <span>{label}</span>}
      {shortcut && (
        <span className="kbd ml-1 px-2 py-0.5 text-[12.5px] font-bold rounded-[5px] min-w-[24px] text-center" style={kbdStyle}>
          {shortcut}
        </span>
      )}
    </button>
  );
}
