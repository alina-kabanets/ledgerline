"use client";

import {
  ArrowUp,
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  CircleDot,
  CircleHelp,
  Cpu,
  FileText,
  Flag,
  Globe,
  Landmark,
  Plus,
  Settings,
  UserRound,
  Waypoints,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { erps } from "@/lib/erp";
import { ENTITY } from "@/lib/seed";
import { useStore } from "@/lib/store";

type Item = { label: string; icon: LucideIcon; badge?: string; chevron?: "left" | "down"; tag?: string };

const top: Item[] = [
  { label: "Overview", icon: Globe },
  { label: "Reports", icon: Flag },
  { label: "Tasks", icon: CircleDot, badge: "4" },
  { label: "Cash", icon: Landmark, chevron: "left" },
  { label: "Rules", icon: Zap },
];

const bottom: Item[] = [
  { label: "Documents", icon: FileText },
  { label: "Contacts", icon: UserRound },
  { label: "Approvals", icon: BadgeCheck },
  { label: "Integrations", icon: Waypoints },
  { label: "Currencies", icon: Globe },
  { label: "API", icon: Cpu },
];

// Only Payments is real. The other entries are there so the page sits in a full app shell.
function Static({ item }: { item: Item }) {
  const Icon = item.icon;
  return (
    <div className="flex h-8 items-center gap-2.5 whitespace-nowrap px-2 text-[12.5px] text-ink" aria-disabled>
      <Icon size={15} strokeWidth={1.5} className="text-muted" />
      <span>{item.label}</span>
      {item.badge && <span className="rounded-full bg-accent px-1.5 text-[10px] text-white">{item.badge}</span>}
      {item.tag && <span className="text-[9px] text-[#2f49e0]">{item.tag}</span>}
      {item.chevron === "left" && <ChevronLeft size={13} className="ml-auto text-faint" />}
    </div>
  );
}

export function Sidebar() {
  const path = usePathname();
  const { state, actions } = useStore();
  const onPayments = path.startsWith("/payments");

  return (
    <aside className="sticky top-0 flex h-screen w-[184px] shrink-0 flex-col border-r border-hairline px-2.5 py-3">
      <div className="mb-4 flex items-center gap-2 px-1">
        <span className="grid size-6 place-items-center rounded-[5px] bg-ink text-[12px] font-medium text-white">L</span>
        <span className="text-[14px] font-medium tracking-tight">Ledgerline</span>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {top.map((item) => (
          <Static key={item.label} item={item} />
        ))}

        <Link
          href="/payments"
          aria-current={onPayments ? "page" : undefined}
          className={`flex h-8 items-center gap-2.5 rounded-[4px] px-2 text-[12.5px] ${onPayments ? "bg-surface-2" : ""}`}
        >
          <ArrowUp size={15} strokeWidth={1.5} className="text-muted" />
          <span>Payments</span>
          <ChevronDown size={13} className="ml-auto text-faint" />
        </Link>
        <div className="ml-4 flex flex-col border-l border-hairline pl-2 text-[11px]">
          <Link href="/payments" className={`-ml-[9px] border-l py-1 pl-2 ${onPayments ? "border-ink text-ink" : "border-transparent text-muted"}`}>
            Invoices &amp; receipts
          </Link>
          <span className="py-1 text-muted">Payroll</span>
        </div>

        {bottom.map((item) => (
          <Static key={item.label} item={item} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5">
        {/* Not part of the product: controls for whoever is watching the demo. */}
        <div className="mb-2 rounded-[6px] border border-dashed border-line p-2 text-[11px] text-muted">
          <div className="mb-1.5 uppercase tracking-wider">Demo controls</div>
          <label className="mb-1.5 flex items-center justify-between gap-2">
            <span>ERP</span>
            <select
              value={state.erpId}
              onChange={(e) => actions.setErp(e.target.value)}
              className="rounded-[4px] border border-line bg-white px-1 py-0.5 text-[11px] text-ink"
            >
              {Object.values(erps).map((erp) => (
                <option key={erp.id} value={erp.id}>
                  {erp.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={actions.reset} className="underline underline-offset-2 hover:text-ink">
            Reset demo data
          </button>
        </div>

        <Static item={{ label: "Settings", icon: Settings }} />
        <Static item={{ label: "Help Center", icon: CircleHelp }} />
        <Static item={{ label: "Add Company", icon: Plus }} />
        <div className="flex h-8 items-center gap-2.5 px-2 text-[12px]">
          <span className="grid size-4 place-items-center rounded-full bg-accent text-[9px] text-white">N</span>
          <span className="truncate" title={ENTITY}>
            Demo Account
          </span>
          <ChevronDown size={12} className="ml-auto text-faint" />
        </div>
        <div className="px-2 pt-1 text-[9px] text-faint">Ledgerline · a concept</div>
      </div>
    </aside>
  );
}
