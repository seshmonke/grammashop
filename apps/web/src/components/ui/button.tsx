import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ice-on-theme",
  {
    variants: {
      variant: {
        default: "bg-magenta text-white hover:bg-magenta/90",
        outline:
          "border border-tg-separator bg-tg-surface text-tg-text hover:bg-tg-separator hover:text-tg-text",
        ghost: "hover:bg-tg-separator hover:text-tg-text",
      },
      size: {
        // Главное действие экрана — всегда `default` (44px, Apple HIG/Material
        // минимальный тач-таргет), никогда `sm` (см. DESIGN_SYSTEM.md#реализация,
        // «Форма <Button> в админках»). `sm` — только построчные действия в
        // списках, компактность там осознанная, не поднимается вместе с default.
        default: "h-11 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
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
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
