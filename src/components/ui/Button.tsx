import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "accent";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[4px] font-normal whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2",
  secondary: "border border-line bg-white text-ink hover:border-ink",
  ghost: "text-ink hover:bg-surface-2",
  accent: "bg-accent text-white hover:bg-[#2f49e0]",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-4 text-[12.5px]",
  md: "h-9 px-4 text-[13px]",
  lg: "h-11 px-6 text-[14px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export function Button({ variant, size, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

type LinkProps = React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant, size, className, ...rest }: LinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
