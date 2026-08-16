import { lookupNoaaHolding } from "../../../lib/public-data";

type RegistryType = "fishing" | "medallion" | "spectrum" | "water";

const REGISTRY_SOURCES = {
  fishing: "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqunitf.csv",
  medallion: "https://data.cityofnewyork.us/Transportation/Medallion-Vehicles-Authorized/rhe8-mgbb",
  spectrum: "https://opendata.fcc.gov/Wireless/ULS-3650-Locations/euz5-46g2",
  water: "https://api.waterdata.usgs.gov/docs/ogcapi/",
} as const;

function normalize(type: RegistryType, raw: string) {
  const value = raw.trim().toUpperCase();
  if (type === "fishing") return value.replace(/^(NMFS|IFQ)[-:# ]*/i, "");
  if (type === "water") return value.startsWith("USGS-") ? value : `USGS-${value.replace(/^USGS[- ]?/i, "")}`;
  return value.replace(/[^A-Z0-9-]/g, "");
}

export async function POST(request: Request) {
  const payload = await request.json() as { type?: RegistryType; identifier?: string };
  const type = payload.type ?? "fishing";
  if (!(["fishing", "medallion", "spectrum", "water"] as string[]).includes(type)) return Response.json({ error: "Unsupported registry type." }, { status: 400 });
  const identifier = normalize(type, payload.identifier ?? "");
  if (!identifier) return Response.json({ error: "Enter a public registry identifier." }, { status: 400 });

  try {
    if (type === "fishing") {
      if (!/^\d{1,8}$/.test(identifier)) return Response.json({ error: "Use an NMFS ID such as NMFS-43983." }, { status: 400 });
      const holding = await lookupNoaaHolding(identifier);
      if (!holding) return Response.json({ error: `No current NOAA quota-share record matched ${identifier}.` }, { status: 404 });
      return Response.json({
        registry: {
          type, identifier: `NMFS-${identifier}`, name: `${holding.species} Quota Share`, owner: holding.holderName,
          status: "Current public record matched", agency: "NOAA Fisheries", geography: holding.areas.join(", "),
          expiration: "Annual allocation; quota share record current for 2026", restrictions: holding.transferEligibility,
          amount: `${holding.qsUnits.toLocaleString()} QS units`, recordCount: holding.recordCount,
        },
        source: { label: "NOAA 2026 IFQ holder dataset", url: holding.sourceUrl, live: true },
      });
    }

    if (type === "medallion") {
      const url = new URL("https://data.cityofnewyork.us/resource/rhe8-mgbb.json");
      url.searchParams.set("$limit", "1");
      url.searchParams.set("license_number", identifier);
      const response = await fetch(url);
      if (!response.ok) throw new Error("NYC TLC registry unavailable");
      const rows = await response.json() as Array<Record<string, string>>;
      const row = rows[0];
      if (!row) return Response.json({ error: `No current NYC TLC medallion matched ${identifier}. Try 4C21.` }, { status: 404 });
      return Response.json({
        registry: {
          type, identifier: row.license_number, name: `${row.medallion_type || "NYC"} Taxi Medallion`, owner: row.name,
          status: row.current_status, agency: "New York City Taxi and Limousine Commission", geography: "New York City",
          expiration: row.type, restrictions: "TLC licensing and transfer approval applies", amount: `Vehicle ${row.model_year || "year not stated"} / ${row.vehicle_type || "standard"}`,
        },
        source: { label: "NYC Open Data - Medallion Vehicles Authorized", url: REGISTRY_SOURCES.medallion, live: true },
      });
    }

    if (type === "spectrum") {
      const url = new URL("https://opendata.fcc.gov/resource/euz5-46g2.json");
      url.searchParams.set("$limit", "1");
      url.searchParams.set("u_call_sign", identifier);
      const response = await fetch(url);
      if (!response.ok) throw new Error("FCC registry unavailable");
      const rows = await response.json() as Array<Record<string, string>>;
      const row = rows[0];
      if (!row) return Response.json({ error: `No FCC ULS 3650 location matched ${identifier}. Try WQVF475.` }, { status: 404 });
      return Response.json({
        registry: {
          type, identifier: row.u_call_sign, name: "FCC ULS 3650 Wireless Authorization", owner: row.u_license_name,
          status: row.u_application_status || "Public ULS record", agency: "Federal Communications Commission", geography: [row.u_city, row.u_state].filter(Boolean).join(", ") || "United States",
          expiration: row.u_expiration_date || "See FCC ULS record", restrictions: "FCC assignment, transfer, and service rules apply", amount: row.u_location_name || "Licensed wireless location",
        },
        source: { label: "FCC Open Data - ULS 3650 Locations", url: REGISTRY_SOURCES.spectrum, live: true },
      });
    }

    const url = `https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations/items/${encodeURIComponent(identifier)}?f=json&api_key=DEMO_KEY`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("USGS Water Data registry unavailable");
    const feature = await response.json() as { properties?: Record<string, string | number | null> };
    const properties = feature.properties ?? {};
    return Response.json({
      registry: {
        type, identifier, name: String(properties.monitoring_location_name || properties.monitoring_location_id || "USGS water-linked record"), owner: String(properties.agency_name || properties.agency_code || "Public agency record"),
        status: String(properties.monitoring_location_status || "Public monitoring location"), agency: "U.S. Geological Survey Water Data",
        geography: [properties.county_name, properties.state_name].filter(Boolean).join(", ") || "United States",
        expiration: "Monitoring-location record; consult state agency for current water-right status",
        restrictions: "Water-right ownership and transfer terms require the authoritative state registry", amount: String(properties.well_depth || properties.drainage_area || "Hydrologic record linked"),
      },
      source: { label: "USGS Water Data API - monitoring locations", url: REGISTRY_SOURCES.water, live: true },
    });
  } catch {
    return Response.json({ error: "The official public registry could not be reached. Try the example identifier again shortly." }, { status: 502 });
  }
}
