/**
 * @file Reusable keyboard-aware button
 * @description A unified button component that handles icons, labels, and keyboard
 * shortcuts with consistent styling and improved visibility.
 *
 * 📖 This component wraps the new UI Button component and provides the legacy
 * KbdButton interface for backward compatibility while adopting the new design.
 */

import React from 'react';
import { Icon } from './Icons';
import { Button } from './ui/button';

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

  let buttonVariant: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "icon" = "secondary";
  
  switch (variant) {
    case 'primary':
      buttonVariant = 'default';
      break;
    case 'secondary':
      buttonVariant = 'outline';
      break;
    case 'ghost':
      buttonVariant = 'ghost';
      break;
    case 'danger':
      buttonVariant = 'destructive';
      break;
    case 'icon':
      buttonVariant = 'icon';
      break;
  }

  const kbdStyle = variant === 'primary' 
    ? { color: 'rgba(0,0,0,0.7)', background: 'rgba(0,0,0,0.15)', borderColor: 'rgba(0,0,0,0.2)' }
    : undefined;

  if (isIconOnly || variant === 'icon') {
    return (
      <Button
        type={type}
        variant="icon"
        size="icon"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={className}
      >
        {IconComponent && <IconComponent size={iconSize} />}
      </Button>
    );
  }

  return (
    <Button
      type={type}
      variant={buttonVariant}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={className}
    >
      {IconComponent && <IconComponent size={iconSize} className="-ms-1 me-2 opacity-60" />}
      {label && <span>{label}</span>}
      {shortcut && (
        <kbd 
          className="-me-1 ms-3 inline-flex h-5 max-h-full items-center rounded border border-border bg-background px-1 font-[inherit] text-[0.625rem] font-medium text-muted-foreground/70"
          style={kbdStyle}
        >
          {shortcut}
        </kbd>
      )}
    </Button>
  );
}
