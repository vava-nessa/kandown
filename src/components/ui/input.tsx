/**
 * @file Text input primitive
 * @description A thin, themed wrapper around `<input>` following the shadcn
 * pattern — it forwards its ref and every native prop, and only contributes
 * styling plus a consistent focus ring.
 *
 * 📖 It exists so that inputs look identical everywhere and restyle with the theme,
 * since the border, ring and placeholder colours all come from tokens. Ad-hoc
 * `<input className="...">` usage still exists in `Drawer.tsx` and
 * `SettingsPage.tsx` and is being migrated onto this component.
 *
 * @functions
 *  → Input — forwardRef input accepting every native input prop
 *
 * @exports Input, InputProps
 */

import * as React from "react"
import { cn } from "../../lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
