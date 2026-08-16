import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type ReportPayload = {
  analysis: { name: string; owner: string; quotaId: string; estimatedValue: number; stressValue: number; borrowingPower: number; score: number; holding: { species: string; qsUnits: number; estimatedIfqPounds: number; estimatedGrossHarvestValue: number; recordCount: number; securityRecordCount: number; transferEligibility: string }; breakdown: { quotaOwnershipValue: number; futureCashFlow: number; scarcityPremium: number; regulatoryAdjustment: number; marketAdjustment: number } };
  market: { allowableCatchPercent: number; fishPrice: number; fuelCost: number; regulatoryRisk: string };
  valuation?: { estimatedValue: number; stressValue: number; borrowingPower: number; score: number; changePercent: number };
  offer?: { lender: string; amount: number; apr: number; termMonths: number; monthlyPayment: number } | null;
};

const dollars = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
const safe = (value: unknown) => String(value ?? "").replace(/[^\x20-\x7E]/g, "-");

export async function POST(request: Request) {
  try {
    const payload = await request.json() as ReportPayload;
    if (!payload.analysis?.quotaId) return Response.json({ error: "A completed evaluation is required." }, { status: 400 });
    const document = await PDFDocument.create();
    document.setTitle(`RightMark NMFS ${safe(payload.analysis.quotaId)} Evaluation`);
    document.setAuthor("RightMark");
    document.setSubject("Illustrative fishing quota evaluation");
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(6 / 255, 24 / 255, 49 / 255), blue = rgb(29 / 255, 111 / 255, 242 / 255), cyan = rgb(100 / 255, 216 / 255, 255 / 255), ink = rgb(16 / 255, 39 / 255, 70 / 255), muted = rgb(100 / 255, 117 / 255, 140 / 255), pale = rgb(238 / 255, 244 / 255, 251 / 255);
    const pageSize: [number, number] = [612, 792];
    const page = document.addPage(pageSize);
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: 0, width, height, color: pale });
    page.drawRectangle({ x: 0, y: height - 250, width, height: 250, color: navy });
    page.drawCircle({ x: 52, y: height - 54, size: 5, color: cyan });
    page.drawText("RightMark", { x: 65, y: height - 60, size: 17, font: bold, color: rgb(1, 1, 1) });
    page.drawText("FISHING QUOTA EVALUATION", { x: 42, y: height - 108, size: 9, font: bold, color: cyan, characterSpacing: 1.4 });
    page.drawText(`NMFS ${safe(payload.analysis.quotaId)}`, { x: 42, y: height - 159, size: 34, font: bold, color: rgb(1, 1, 1) });
    page.drawText(safe(payload.analysis.name), { x: 42, y: height - 187, size: 15, font: regular, color: rgb(.69, .77, .87) });
    page.drawText(safe(payload.analysis.owner), { x: 42, y: height - 213, size: 11, font: regular, color: rgb(.55, .65, .77) });
    page.drawText("MODELED VALUE", { x: 42, y: 496, size: 9, font: bold, color: muted });
    page.drawText(dollars(payload.valuation?.estimatedValue ?? payload.analysis.estimatedValue), { x: 42, y: 454, size: 34, font: bold, color: ink });
    page.drawText("STRESS VALUE", { x: 235, y: 496, size: 9, font: bold, color: muted });
    page.drawText(dollars(payload.valuation?.stressValue ?? payload.analysis.stressValue), { x: 235, y: 460, size: 25, font: bold, color: ink });
    page.drawText("MODELED CAPACITY", { x: 415, y: 496, size: 9, font: bold, color: muted });
    page.drawText(dollars(payload.valuation?.borrowingPower ?? payload.analysis.borrowingPower), { x: 415, y: 460, size: 25, font: bold, color: blue });
    page.drawLine({ start: { x: 42, y: 425 }, end: { x: 570, y: 425 }, thickness: 1, color: rgb(.78, .84, .9) });
    const rows = [["Quota share units", payload.analysis.holding.qsUnits.toLocaleString("en-US")], ["Estimated 2026 IFQ", `${Math.round(payload.analysis.holding.estimatedIfqPounds).toLocaleString("en-US")} lb`], ["Matched public records", `${payload.analysis.holding.recordCount} holder / ${payload.analysis.holding.securityRecordCount} serial`], ["Gross harvest basis", dollars(payload.analysis.holding.estimatedGrossHarvestValue)], ["Transfer file status", safe(payload.analysis.holding.transferEligibility).slice(0, 55)], ["Risk score", `${payload.valuation?.score ?? payload.analysis.score} / 100`]];
    page.drawText("PUBLIC RECORD AND MODEL SUMMARY", { x: 42, y: 392, size: 10, font: bold, color: blue, characterSpacing: .8 });
    rows.forEach(([label, value], index) => { const y = 355 - index * 38; page.drawText(String(label), { x: 42, y, size: 10, font: regular, color: muted }); page.drawText(String(value), { x: 275, y, size: 10, font: bold, color: ink }); page.drawLine({ start: { x: 42, y: y - 13 }, end: { x: 570, y: y - 13 }, thickness: .5, color: rgb(.82, .87, .92) }); });
    page.drawRectangle({ x: 42, y: 60, width: 528, height: 62, color: navy });
    page.drawText("Important", { x: 58, y: 96, size: 9, font: bold, color: cyan });
    page.drawText("This report is an indicative model, not an appraisal, loan approval, or proof of ownership.", { x: 58, y: 76, size: 9, font: regular, color: rgb(.78, .85, .93) });

    const detail = document.addPage(pageSize);
    detail.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
    detail.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: navy });
    detail.drawText("Evaluation detail", { x: 42, y: height - 58, size: 24, font: bold, color: rgb(1, 1, 1) });
    detail.drawText(`NMFS ${safe(payload.analysis.quotaId)}`, { x: 466, y: height - 54, size: 11, font: bold, color: cyan });
    detail.drawText("VALUATION BREAKDOWN", { x: 42, y: 655, size: 10, font: bold, color: blue, characterSpacing: 1 });
    const breakdown = [["Quota ownership value", payload.analysis.breakdown.quotaOwnershipValue], ["Expected future cash flow", payload.analysis.breakdown.futureCashFlow], ["Scarcity premium", payload.analysis.breakdown.scarcityPremium], ["Regulatory adjustment", payload.analysis.breakdown.regulatoryAdjustment], ["Market adjustment", payload.analysis.breakdown.marketAdjustment]] as const;
    breakdown.forEach(([label, value], index) => { const y = 615 - index * 42; detail.drawText(label, { x: 42, y, size: 11, font: regular, color: muted }); detail.drawText(`${value >= 0 ? "+" : ""}${dollars(value)}`, { x: 440, y, size: 12, font: bold, color: value >= 0 ? blue : rgb(.75, .25, .32) }); detail.drawLine({ start: { x: 42, y: y - 14 }, end: { x: 570, y: y - 14 }, thickness: .5, color: rgb(.84, .88, .93) }); });
    detail.drawText("SCENARIO ASSUMPTIONS", { x: 42, y: 368, size: 10, font: bold, color: blue, characterSpacing: 1 });
    [`Allowable catch: ${payload.market.allowableCatchPercent}%`, `Weighted price: $${payload.market.fishPrice.toFixed(2)} / lb`, `Fuel cost: $${payload.market.fuelCost.toFixed(2)} / gal`, `Regulatory risk: ${safe(payload.market.regulatoryRisk)}`].forEach((text, index) => detail.drawText(text, { x: 42 + (index % 2) * 265, y: 330 - Math.floor(index / 2) * 36, size: 11, font: regular, color: ink }));
    if (payload.offer) { detail.drawRectangle({ x: 42, y: 145, width: 528, height: 105, color: pale }); detail.drawText("SELECTED ILLUSTRATIVE OPTION", { x: 58, y: 222, size: 9, font: bold, color: blue, characterSpacing: .7 }); detail.drawText(safe(payload.offer.lender), { x: 58, y: 190, size: 20, font: bold, color: ink }); detail.drawText(`${dollars(payload.offer.amount)}  |  ${payload.offer.apr}% APR  |  ${payload.offer.termMonths} months  |  ${dollars(payload.offer.monthlyPayment)} monthly`, { x: 58, y: 166, size: 10, font: regular, color: muted }); }
    detail.drawText("Sources: NOAA public IFQ records, IPHC fishery data, and U.S. EIA energy data.", { x: 42, y: 76, size: 8, font: regular, color: muted });
    detail.drawText("Generated by RightMark. Public data does not authenticate the visitor, ownership, liens, or transfer approval.", { x: 42, y: 58, size: 8, font: regular, color: muted });
    const bytes = await document.save();
    return new Response(bytes, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="RightMark-NMFS-${safe(payload.analysis.quotaId)}-report.pdf"`, "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "The PDF report could not be generated." }, { status: 500 }); }
}
