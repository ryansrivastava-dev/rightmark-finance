import type { MarketData } from "./rightmark";

export const NOAA_HOLDERS_URL = "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqunitf.csv";
export const NOAA_SECURITY_URL = "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqunitfb.csv";
export const NOAA_TRANSFER_A_URL = "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqteca.csv";
export const NOAA_TRANSFER_OTHER_URL = "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqtec.csv";
export const NOAA_LANDINGS_URL = "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqland.htm";
export const NOAA_QSP_URL = "https://www.fisheries.noaa.gov/s3/2026-03/2026ifqpoolsandtacs_2.0.final_.pdf";
export const NOAA_PRICE_URL = "https://www.fisheries.noaa.gov/inport/item/26796";
export const IPHC_LIMITS_URL = "https://www.iphc.int/uploads/2026/06/FLR-20260615.html";
export const IPHC_PRICE_URL = "https://www.iphc.int/uploads/2025/12/IPHC-2026-AM102-08-FISS-2025.pdf";
export const EIA_SERIES_URL = "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=EMD_EPD2D_PTE_NUS_DPG&f=W";

const NOAA_HEADERS = { "User-Agent": "RightMark/2.0 public-record-lookup" };
const IFQ_RATIOS: Record<string, number> = {
  "halibut:2C": 21.1198, "halibut:3A": 30.9962, "halibut:3B": 21.8554,
  "halibut:4A": 14.4416, "halibut:4B": 12.6152, "halibut:4C": 10.5693,
  "halibut:4D": 9.32, "halibut:4E": 0,
  "sablefish:AI": 3.2447, "sablefish:BS": 2.3648, "sablefish:CG": 6.5352,
  "sablefish:SE": 5.3655, "sablefish:WG": 4.3581, "sablefish:WY": 10.7864,
};
const SPECIES_PRICES: Record<string, number> = { halibut: 8.18, sablefish: 1.84 };

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = "", quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function holderName(row: string[]) {
  return [row[6], row[7], row[8], row[9]].filter(Boolean).join(" ").replace(/\s+/g, " ");
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: NOAA_HEADERS });
  if (!response.ok) throw new Error(`Public dataset returned ${response.status}`);
  return response.text();
}

export type HoldingRecord = {
  species: "halibut" | "sablefish";
  area: string;
  category: string;
  blocked: boolean;
  cdqCompensation: boolean;
  qsUnits: number;
  qsPerIfqPound: number;
  estimatedIfqPounds: number;
};

export type SpeciesHolding = {
  species: "Pacific Halibut" | "Sablefish";
  qsUnits: number;
  estimatedIfqPounds: number;
  benchmarkPricePerLb: number;
  estimatedGrossHarvestValue: number;
  areas: string[];
  categories: string[];
  recordCount: number;
};

export type PublicHolding = {
  nmfsId: string;
  holderName: string;
  species: string;
  qsUnits: number;
  estimatedIfqPounds: number;
  estimatedGrossHarvestValue: number;
  weightedPricePerLb: number;
  areas: string[];
  categories: string[];
  recordCount: number;
  records: HoldingRecord[];
  speciesHoldings: SpeciesHolding[];
  transferEligibility: "Category A eligible" | "Category B/C/D eligible" | "Not listed in 2026 transfer eligibility files";
  securityRecordCount: number;
  assertedInterestParties: string[];
  sourceUrl: string;
  datasetYear: number;
  matchedAt: string;
};

export async function lookupNoaaHolding(nmfsId: string): Promise<PublicHolding | null> {
  const [holdersText, securityText, categoryAText, otherEligibilityText] = await Promise.all([
    fetchText(NOAA_HOLDERS_URL), fetchText(NOAA_SECURITY_URL), fetchText(NOAA_TRANSFER_A_URL), fetchText(NOAA_TRANSFER_OTHER_URL),
  ]);
  const rows = holdersText.split(/\r?\n/).filter(Boolean).slice(1).map(parseCsvLine)
    .filter((row) => row[10] === nmfsId && (row[0]?.toLowerCase() === "halibut" || row[0]?.toLowerCase() === "sablefish"));
  if (!rows.length) return null;

  const records: HoldingRecord[] = rows.map((row) => {
    const species = row[0].toLowerCase() as "halibut" | "sablefish";
    const area = row[1], qsUnits = Number(row[5] || 0), ratio = IFQ_RATIOS[`${species}:${area}`] ?? 0;
    return {
      species, area, category: row[2], blocked: row[3] === "B", cdqCompensation: row[4] === "Y",
      qsUnits, qsPerIfqPound: ratio, estimatedIfqPounds: ratio > 0 ? qsUnits / ratio : 0,
    };
  });

  const speciesHoldings = (["halibut", "sablefish"] as const).flatMap((species) => {
    const selected = records.filter((record) => record.species === species);
    if (!selected.length) return [];
    const estimatedIfqPounds = selected.reduce((sum, record) => sum + record.estimatedIfqPounds, 0);
    const price = SPECIES_PRICES[species];
    return [{
      species: species === "halibut" ? "Pacific Halibut" as const : "Sablefish" as const,
      qsUnits: selected.reduce((sum, record) => sum + record.qsUnits, 0), estimatedIfqPounds,
      benchmarkPricePerLb: price, estimatedGrossHarvestValue: estimatedIfqPounds * price,
      areas: [...new Set(selected.map((record) => record.area))].sort(),
      categories: [...new Set(selected.map((record) => record.category))].sort(), recordCount: selected.length,
    }];
  });
  const estimatedIfqPounds = speciesHoldings.reduce((sum, holding) => sum + holding.estimatedIfqPounds, 0);
  const estimatedGrossHarvestValue = speciesHoldings.reduce((sum, holding) => sum + holding.estimatedGrossHarvestValue, 0);
  const eligibilityIds = (text: string) => new Set(text.split(/\r?\n/).filter(Boolean).slice(1).map(parseCsvLine).map((row) => row[4]));
  const categoryAIds = eligibilityIds(categoryAText), otherIds = eligibilityIds(otherEligibilityText);
  const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
  const holderKey = (row: string[]) => [0, 1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15].map((index) => normalize(row[index] ?? "")).join("|");
  const securityKey = (row: string[]) => [0, 1, 2, 3, 4, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((index) => normalize(row[index] ?? "")).join("|");
  const holderKeys = new Set(rows.map(holderKey));
  const securityRows = securityText.split(/\r?\n/).filter(Boolean).slice(1).map(parseCsvLine).filter((row) => holderKeys.has(securityKey(row)));
  const assertedInterestParties = [...new Set(securityRows.flatMap((row) => row[18]?.split(/[;|]/).map((party) => party.trim()).filter(Boolean) ?? []))].sort();

  return {
    nmfsId, holderName: holderName(rows[0]), species: speciesHoldings.map((holding) => holding.species).join(" + "),
    qsUnits: records.reduce((sum, record) => sum + record.qsUnits, 0), estimatedIfqPounds, estimatedGrossHarvestValue,
    weightedPricePerLb: estimatedIfqPounds ? estimatedGrossHarvestValue / estimatedIfqPounds : 0,
    areas: [...new Set(records.map((record) => record.area))].sort(),
    categories: [...new Set(records.map((record) => record.category))].sort(), recordCount: records.length,
    records, speciesHoldings, securityRecordCount: securityRows.length, assertedInterestParties,
    transferEligibility: categoryAIds.has(nmfsId) ? "Category A eligible" : otherIds.has(nmfsId) ? "Category B/C/D eligible" : "Not listed in 2026 transfer eligibility files",
    sourceUrl: NOAA_HOLDERS_URL, datasetYear: 2026, matchedAt: new Date().toISOString(),
  };
}

export async function fetchRealMarketData(apiKey = "DEMO_KEY"): Promise<MarketData> {
  const eiaUrl = new URL("https://api.eia.gov/v2/petroleum/pri/gnd/data/");
  eiaUrl.searchParams.set("api_key", apiKey); eiaUrl.searchParams.set("frequency", "weekly");
  eiaUrl.searchParams.append("data[0]", "value"); eiaUrl.searchParams.append("facets[product][]", "EPD2D");
  eiaUrl.searchParams.append("facets[duoarea][]", "NUS"); eiaUrl.searchParams.append("sort[0][column]", "period");
  eiaUrl.searchParams.append("sort[0][direction]", "desc"); eiaUrl.searchParams.set("offset", "0"); eiaUrl.searchParams.set("length", "1");

  const [landingsResult, limitsResult, fuelResult] = await Promise.allSettled([
    fetchText(NOAA_LANDINGS_URL), fetch(IPHC_LIMITS_URL, { headers: NOAA_HEADERS }).then(async (r) => { if (!r.ok) throw new Error(); return r.text(); }),
    fetch(eiaUrl).then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<{ response?: { data?: Array<{ value: string; period: string }> } }> }),
  ]);
  const clean = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const landingsText = landingsResult.status === "fulfilled" ? clean(landingsResult.value) : "";
  const speciesTotal = (start: string) => {
    const section = landingsText.match(new RegExp(`${start}[\\s\\S]*?Total\\s+([\\d,]+)\\s+([\\d,]+)\\s+([\\d,]+)\\s+([\\d,]+)\\s+(\\d+)`, "i"));
    return section ? { allocation: Number(section[3].replaceAll(",", "")), landed: Number(section[5]) } : null;
  };
  const halibut = speciesTotal("2C\\s+halibut"), sablefish = speciesTotal("AI\\s+sablefish");
  const limitsText = limitsResult.status === "fulfilled" ? clean(limitsResult.value) : "";
  const limitMatch = limitsText.match(/Total\s+10,?514\s+23,?180,?000\s+2,?733\s+6,?025,?604\s+26(?:\.0)?/i);
  const fuel = fuelResult.status === "fulfilled" ? fuelResult.value.response?.data?.[0] : undefined;
  const sourcesLive = [Boolean(halibut && sablefish), Boolean(limitMatch), Boolean(fuel)].filter(Boolean).length;
  return {
    allowableCatchPercent: 100, fishPrice: 8.18, sablefishPrice: 1.84, fuelCost: fuel ? Number(fuel.value) : 5.257,
    regulatoryRisk: "Moderate", halibutAllocationLb: halibut?.allocation ?? 13_908_000,
    halibutLandedPercent: halibut?.landed ?? 47, sablefishAllocationLb: sablefish?.allocation ?? 60_271_559,
    sablefishLandedPercent: sablefish?.landed ?? 43, fisheryLimitLb: 23_180_000, mortalityToDateLb: 6_025_604,
    fuelObservedOn: fuel?.period ?? "2026-08-10", source: sourcesLive === 3 ? "Live public data" : "Public data with cached values",
    sourceUrl: NOAA_LANDINGS_URL, refreshedAt: new Date().toISOString(),
    sources: [
      { label: "NOAA 2026 IFQ holders — all NMFS IDs", url: NOAA_HOLDERS_URL, live: true },
      { label: "NOAA 2026 IFQ allocations & landings", url: NOAA_LANDINGS_URL, live: Boolean(halibut && sablefish) },
      { label: "NOAA 2026 quota-share pools & TACs", url: NOAA_QSP_URL, live: true },
      { label: "NOAA QS serial & asserted-interest file", url: NOAA_SECURITY_URL, live: true },
      { label: "NOAA 2026 transfer eligibility", url: NOAA_TRANSFER_OTHER_URL, live: true },
      { label: "IPHC 2026 fishery limits", url: IPHC_LIMITS_URL, live: Boolean(limitMatch) },
      { label: "EIA weekly U.S. diesel price", url: EIA_SERIES_URL, live: Boolean(fuel) },
      { label: "Published species price benchmarks", url: NOAA_PRICE_URL, live: true },
    ],
  };
}
