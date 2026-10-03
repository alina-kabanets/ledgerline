import { formatMoney, moneyParts } from "@/lib/money";
import type { Currency } from "@/lib/types";

// Money format: small grey currency code, dark whole part, small grey decimals.
export function Money({ amount, currency, size = "row" }: { amount: number; currency: Currency; size?: "row" | "hero" | "sub" }) {
  const { sign, int, dec } = moneyParts(amount);
  const styles = {
    row: { code: "text-[11px]", int: "text-[13.5px]", dec: "text-[11px]" },
    sub: { code: "text-[11px]", int: "text-[15px]", dec: "text-[11px]" },
    hero: { code: "text-[15px]", int: "text-[44px] font-light leading-none tracking-tight", dec: "text-[16px]" },
  }[size];
  return (
    <span className="tabular whitespace-nowrap" aria-label={formatMoney(amount, currency)}>
      <span aria-hidden className={`${styles.code} text-faint`}>
        {currency}{" "}
      </span>
      <span aria-hidden className={styles.int}>
        {sign}
        {int}
      </span>
      <span aria-hidden className={`${styles.dec} text-faint`}>
        .{dec}
      </span>
    </span>
  );
}
