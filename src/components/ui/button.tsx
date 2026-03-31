// src/components/ui/button.tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "destructive" | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 " +
  "disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  default:
    "bg-amber-500/90 text-black hover:bg-amber-500 shadow-[0_10px_20px_rgba(0,0,0,0.25)]",
  secondary:
    "bg-white/10 text-white hover:bg-white/15 border border-white/10",
  ghost:
    "bg-transparent text-white/85 hover:bg-white/10",
  outline:
    "bg-transparent text-white border border-white/20 hover:bg-white/10",
  destructive:
    "bg-red-600/90 text-white hover:bg-red-600 shadow-[0_10px_20px_rgba(0,0,0,0.25)]",
  link:
    "bg-transparent text-amber-400 hover:text-amber-300 underline-offset-4 hover:underline",
};

const sizes: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3",
  lg: "h-11 px-6",
  icon: "h-10 w-10",
};

function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, type ButtonVariant };
export function buttonVariants(opts?: { variant?: ButtonVariant; size?: ButtonSize; className?: string }) {
  const { variant = "default", size = "default", className } = opts || {};
  return cn(base, variants[variant], sizes[size], className);
}
