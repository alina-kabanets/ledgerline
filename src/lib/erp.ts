// GL and tax codes belong to the customer's ERP, so they come from an adapter and are
// never hard-coded in the UI. Adding NetSuite, Campfire or Light means adding an adapter.

export type GlAccount = { code: string; name: string };
export type TaxCode = { code: string; name: string; rate: number };
export type ExtraLineField = { key: string; label: string; options: string[] };

export type ErpAdapter = {
  id: string;
  name: string;
  glAccounts: GlAccount[];
  taxCodes: TaxCode[];
  // The code that means "no tax". Used when a document shows no VAT.
  noTaxCode: string;
  // Fields this ERP requires on every line beyond GL and tax.
  extraLineFields: ExtraLineField[];
  documentUrl: (id: string) => string;
};

const xero: ErpAdapter = {
  id: "xero",
  name: "Xero",
  glAccounts: [
    { code: "400", name: "Advertising" },
    { code: "404", name: "Bank Fees" },
    { code: "412", name: "Consulting & Accounting" },
    { code: "420", name: "Entertainment" },
    { code: "425", name: "Freight & Courier" },
    { code: "429", name: "General Expenses" },
    { code: "441", name: "Legal Expenses" },
    { code: "453", name: "Office Expenses" },
    { code: "461", name: "Printing & Stationery" },
    { code: "463", name: "IT Software & Consumables" },
    { code: "469", name: "Rent" },
    { code: "477", name: "Salaries" },
    { code: "485", name: "Subscriptions" },
    { code: "489", name: "Telephone & Internet" },
    { code: "493", name: "Travel - National" },
    { code: "494", name: "Travel - International" },
    { code: "630", name: "Inventory" },
  ],
  taxCodes: [
    { code: "INPUT2", name: "20% (VAT on Expenses)", rate: 0.2 },
    { code: "RRINPUT", name: "5% (VAT on Expenses)", rate: 0.05 },
    { code: "ZERORATEDINPUT", name: "Zero Rated Expenses", rate: 0 },
    { code: "EXEMPTINPUT", name: "Exempt Expenses", rate: 0 },
    { code: "NONE", name: "No VAT", rate: 0 },
  ],
  noTaxCode: "NONE",
  extraLineFields: [],
  documentUrl: (id) => `https://go.xero.com/AccountsPayable/View.aspx?ref=${id}`,
};

// NetSuite names its codes differently and requires a department on every line.
const netsuite: ErpAdapter = {
  id: "netsuite",
  name: "NetSuite",
  glAccounts: [
    { code: "6010", name: "Advertising & Marketing" },
    { code: "6040", name: "Bank Service Charges" },
    { code: "6120", name: "Professional Fees" },
    { code: "6200", name: "Meals & Entertainment" },
    { code: "6290", name: "Office Supplies" },
    { code: "6300", name: "Software & Subscriptions" },
    { code: "6400", name: "Rent" },
    { code: "6500", name: "Telecommunications" },
    { code: "6600", name: "Travel" },
    { code: "1300", name: "Inventory Asset" },
  ],
  taxCodes: [
    { code: "VAT:S-GB", name: "Standard 20%", rate: 0.2 },
    { code: "VAT:R-GB", name: "Reduced 5%", rate: 0.05 },
    { code: "VAT:Z-GB", name: "Zero 0%", rate: 0 },
    { code: "VAT:E-GB", name: "Exempt", rate: 0 },
    { code: "VAT:O-GB", name: "Outside scope", rate: 0 },
  ],
  noTaxCode: "VAT:O-GB",
  extraLineFields: [{ key: "department", label: "Department", options: ["Engineering", "Operations", "Sales", "Finance"] }],
  documentUrl: (id) => `https://system.netsuite.com/app/accounting/transactions/vendbill.nl?id=${id}`,
};

export const erps: Record<string, ErpAdapter> = { xero, netsuite };

export function getErp(id: string): ErpAdapter {
  return erps[id] ?? xero;
}

export function glName(erp: ErpAdapter, code: string | null) {
  return erp.glAccounts.find((a) => a.code === code)?.name ?? null;
}

export function taxFor(erp: ErpAdapter, code: string | null) {
  return erp.taxCodes.find((t) => t.code === code) ?? null;
}
