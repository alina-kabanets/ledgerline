import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { Toasts } from "@/components/ui/Toasts";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const app = Sora({ variable: "--font-app", subsets: ["latin"], weight: ["300", "400", "500"] });

export const metadata: Metadata = {
  title: "Payments · Ledgerline",
  description: "Invoices and receipts",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${app.variable} h-full`}>
      <body className="min-h-full">
        <StoreProvider>
          {children}
          <Toasts />
        </StoreProvider>
      </body>
    </html>
  );
}
