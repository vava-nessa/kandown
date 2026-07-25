/**
 * @file Textarea primitive
 * @description The multi-line counterpart to `Input` — same shadcn pattern, same
 * token-driven styling and focus ring, with a minimum height so an empty field
 * still reads as multi-line.
 *
 * 📖 Used for plain free-text fields only. The task body is *not* edited here: it
 * goes through `BlockNoteMarkdownEditor`, which round-trips markdown safely.
 *
 * @functions
 *  → Textarea — forwardRef textarea accepting every native textarea prop
 *
 * @exports Textarea, TextareaProps
 */

import * as React from "react"
import { cn } from "../../lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
