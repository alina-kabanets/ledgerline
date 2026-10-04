import { describe, expect, it } from "vitest";
import { getErp } from "./erp";
import { lineGross, newLine, setGross, setNet, setTaxCode } from "./lines";
import { netOf, parseMoney, taxOn, toInput } from "./money";
import { taxMismatch } from "./rules";
import { line, receipt } from "./testing";

const erp = getErp("xero");

describe("money", () => {
  it("parses pounds to pence without floating point", () => {
    expect(parseMoney("1,204.50")).toBe(120450);
    expect(parseMoney("12.4")).toBe(1240);
    expect(parseMoney("0.57")).toBe(57);
    expect(parseMoney("1.15")).toBe(115);
    expect(parseMoney("-3.00")).toBe(-300);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
  });
  it("shows pence as pounds", () => {
    expect(toInput(1240)).toBe("12.40");
    expect(toInput(-5)).toBe("-0.05");
  });
  it("rounds a refund as the mirror of its purchase", () => {
    expect(taxOn(250, 5)).toBe(13);
    expect(taxOn(-250, 5)).toBe(-13);
    expect(netOf(1452, 20) + taxOn(netOf(1452, 20), 20)).toBe(1452);
  });
});

describe("lines", () => {
  it("keeps the amount paid when the tax code changes on a receipt", () => {
    const zero = setTaxCode(line(1000, 200), "ZERORATEDINPUT", erp, "gross");
    expect(lineGross(zero)).toBe(1200);
    expect(zero.tax).toBe(0);
  });
  it("keeps the net amount when the tax code changes on an invoice", () => {
    const zero = setTaxCode(line(1000, 200), "NONE", erp, "net");
    expect(zero.unitAmount).toBe(1000);
    expect(zero.tax).toBe(0);
  });
  it("splits an amount paid into net and tax", () => {
    const split = setGross(line(0, 0), 1452, erp);
    expect([split.unitAmount, split.tax]).toEqual([1210, 242]);
  });
  it("works out tax from quantity and price", () => {
    expect(setNet(line(0, 0), 5, 1800, erp).tax).toBe(1800);
  });
  it("marks an edited amount as edited", () => {
    expect(setGross(line(1000, 200, { amountMeta: { origin: "document" } }), 500, erp).amountMeta?.origin).toBe("user");
  });
  it("starts a new line with no codes", () => {
    expect(newLine("n")).toMatchObject({ glCode: null, taxCode: null });
  });
  it("itemising the mixed-VAT receipt makes its tax agree with its codes", () => {
    const first = setGross(line(2933, 242), 1452, erp);
    const second = setGross(setTaxCode({ ...newLine("l2"), description: "Food", glCode: "453" }, "ZERORATEDINPUT", erp, "gross"), 1723, erp);
    const itemised = receipt({ total: 3175, lines: [first, second] });
    expect(lineGross(first) + lineGross(second)).toBe(3175);
    expect(taxMismatch(itemised, erp)).toBe(false);
  });
});
