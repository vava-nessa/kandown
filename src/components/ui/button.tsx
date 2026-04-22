import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/utils"; // use relative path because alias is not set up

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-[15px] font-semibold transition-all outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border border-primary hover:bg-primary/90 hover:border-primary/90 shadow-sm",
        destructive:
          "bg-transparent text-danger border border-border-strong hover:bg-danger/10 hover:border-danger shadow-sm",
        outline:
          "bg-transparent text-fg border border-border-strong hover:bg-bg-2 hover:border-border-focus",
        secondary:
          "bg-transparent text-fg-dim border border-transparent hover:bg-bg-2 hover:text-fg",
        ghost: "bg-transparent text-fg-dim border border-transparent hover:bg-bg-2 hover:text-fg",
        link: "text-primary underline-offset-4 hover:underline",
        icon: "w-11 h-11 p-0 text-fg-dim bg-transparent border border-transparent hover:bg-bg-2 hover:text-fg",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
