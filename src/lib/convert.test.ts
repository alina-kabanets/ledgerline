import { describe, expect, it } from "vitest";
import { toInvoice, toReceipt } from "./convert";
import { issuesFor } from "./rules";
import { contact, ctx, invoice } from "./testing";

const flagged = invoice({
  status: "ready_to_pay",
  meta: { supplier: { origin: "document" }, dueOn: { origin: "document", uncertain: true, reason: "Two dates" }, total: { origin: "document", uncertain: true } },
});

describe("changing type", () => {
  const asReceipt = toReceipt(flagged);

  it("drops flags for fields a receipt does not have", () => {
    expect(asReceipt.meta.dueOn).toBeUndefined();
    expect(asReceipt.meta.total?.uncertain).toBe(true);
    const uncertain = issuesFor(asReceipt, ctx([asReceipt])).find((i) => i.code === "uncertain");
    expect(uncertain?.label).toBe("1 value to check");
  });

  it("keeps what the receipt cannot show, and gives it back", () => {
    const back = toInvoice(asReceipt, [contact]);
    expect(back).toMatchObject({ number: "INV-1", dueOn: "2026-10-20", contactId: "c1", supplier: "Carver Interiors" });
    expect(back.meta.dueOn?.uncertain).toBe(true);
  });

  it("always comes back as a draft", () => {
    expect(toInvoice(asReceipt, [contact]).status).toBe("draft");
  });

  it("keeps an edit made while it was a receipt", () => {
    const edited = { ...asReceipt, merchant: "Carver Interiorsorporated", meta: { ...asReceipt.meta, merchant: { origin: "user" as const } } };
    const back = toInvoice(edited, [contact]);
    expect(back.supplier).toBe("Carver Interiorsorporated");
    expect(back.meta.supplier?.origin).toBe("user");
  });
});
