import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Keyword-based heuristics (always runs as fallback) ───────────────────────

const ITEM_TYPE_KEYWORDS: Record<string, string[]> = {
  Equipment: [
    "oscilloscope",
    "multimeter",
    "generator",
    "analyzer",
    "scope",
    "spectrometer",
    "microscope",
    "centrifuge",
    "autoclave",
    "incubator",
    "printer",
    "scanner",
    "projector",
    "monitor",
    "computer",
    "laptop",
    "server",
    "router",
    "switch",
    "camera",
    "drone",
    "robot",
    "power supply",
    "function generator",
    "signal generator",
  ],
  Glassware: [
    "beaker",
    "flask",
    "test tube",
    "pipette",
    "burette",
    "funnel",
    "petri dish",
    "graduated cylinder",
    "volumetric",
    "erlenmeyer",
    "condenser",
    "distillation",
    "round bottom",
    "watch glass",
  ],
  Chemical: [
    "acid",
    "base",
    "solvent",
    "reagent",
    "solution",
    "compound",
    "ethanol",
    "methanol",
    "acetone",
    "chloroform",
    "sulfuric",
    "hydrochloric",
    "nitric",
    "sodium hydroxide",
    "potassium",
    "indicator",
    "buffer",
    "catalyst",
  ],
  "Measuring Instrument": [
    "caliper",
    "micrometer",
    "gauge",
    "thermometer",
    "hygrometer",
    "barometer",
    "manometer",
    "scale",
    "balance",
    "weighing",
    "flow meter",
    "ph meter",
    "conductivity meter",
    "lux meter",
  ],
  "Safety Equipment": [
    "goggles",
    "gloves",
    "lab coat",
    "face shield",
    "respirator",
    "fire extinguisher",
    "first aid",
    "safety shower",
    "eye wash",
    "fume hood",
    "biosafety cabinet",
    "ppe",
  ],
  Tool: [
    "wrench",
    "screwdriver",
    "plier",
    "hammer",
    "drill",
    "saw",
    "cutter",
    "crimper",
    "soldering",
    "wire stripper",
    "hex key",
    "socket",
    "ratchet",
    "clamp",
    "vise",
  ],
  Consumable: [
    "filter paper",
    "litmus",
    "tape",
    "adhesive",
    "wire",
    "cable",
    "resistor",
    "capacitor",
    "led",
    "transistor",
    "diode",
    "fuse",
    "battery",
    "solder",
    "flux",
    "thermal paste",
    "lubricant",
  ],
  Furniture: [
    "table",
    "chair",
    "desk",
    "cabinet",
    "shelf",
    "rack",
    "stool",
    "workbench",
    "trolley",
    "locker",
    "whiteboard",
  ],
};

const SAFETY_KEYWORDS: Record<string, string[]> = {
  hazardous: [
    "radioactive",
    "biohazard",
    "carcinogen",
    "toxic gas",
    "explosive",
    "cyanide",
    "mercury",
  ],
  high: [
    "acid",
    "corrosive",
    "flammable",
    "oxidizer",
    "toxic",
    "concentrated",
    "fuming",
    "pyrophoric",
    "reactive",
    "hazardous",
    "dangerous",
  ],
  medium: [
    "laser",
    "high voltage",
    "uv",
    "compressed gas",
    "hot plate",
    "centrifuge",
    "autoclave",
    "solvent",
    "irritant",
    "sharp",
    "electrical",
    "heavy",
  ],
  low: [],
};

function inferItemType(name: string, description?: string): string | null {
  const text = `${name} ${description || ""}`.toLowerCase();
  for (const [type, keywords] of Object.entries(ITEM_TYPE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return type;
  }
  return null;
}

function inferSafetyLevel(name: string, description?: string): string | null {
  const text = `${name} ${description || ""}`.toLowerCase();
  for (const level of ["hazardous", "high", "medium"] as const) {
    if (SAFETY_KEYWORDS[level].some((kw) => text.includes(kw))) return level;
  }
  return "low";
}

// ─── Online enrichment via free APIs ──────────────────────────────────────────

interface EnrichmentResult {
  name: string;
  description: string | null;
  image_url: string | null;
  item_type: string | null;
  safety_level: string | null;
  source: string;
}

async function fetchFromWikipedia(
  query: string,
): Promise<{ description: string | null; image_url: string | null }> {
  try {
    // Step 1: Search for the item
    const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const resp = await fetch(searchUrl, {
      headers: { "User-Agent": "LabLink-Inventory/1.0" },
    });

    if (!resp.ok) {
      // Try with just the first word or main term
      const simplified = query.split(/\s+/).slice(0, 2).join(" ");
      const retryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(simplified)}`;
      const retryResp = await fetch(retryUrl, {
        headers: { "User-Agent": "LabLink-Inventory/1.0" },
      });
      if (!retryResp.ok) return { description: null, image_url: null };
      const retryData = await retryResp.json();
      return {
        description: retryData.extract || null,
        image_url:
          retryData.thumbnail?.source ||
          retryData.originalimage?.source ||
          null,
      };
    }

    const data = await resp.json();
    return {
      description: data.extract || null,
      image_url: data.thumbnail?.source || data.originalimage?.source || null,
    };
  } catch (err) {
    console.error(`Wikipedia fetch error for "${query}":`, err);
    return { description: null, image_url: null };
  }
}

async function fetchFromDuckDuckGo(
  query: string,
): Promise<{ description: string | null; image_url: string | null }> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "LabLink-Inventory/1.0" },
    });

    if (!resp.ok) return { description: null, image_url: null };

    const data = await resp.json();
    const description =
      data.Abstract || data.AbstractText || data.Answer || null;
    const image_url = data.Image
      ? data.Image.startsWith("http")
        ? data.Image
        : `https://duckduckgo.com${data.Image}`
      : null;

    return { description, image_url };
  } catch (err) {
    console.error(`DuckDuckGo fetch error for "${query}":`, err);
    return { description: null, image_url: null };
  }
}

async function enrichItem(
  name: string,
  brand?: string,
): Promise<EnrichmentResult> {
  const searchQuery = brand ? `${name} ${brand}` : name;

  // Try Wikipedia first (usually better quality for lab equipment)
  const wiki = await fetchFromWikipedia(searchQuery);

  // If Wikipedia didn't return enough, try DuckDuckGo
  let ddg = {
    description: null as string | null,
    image_url: null as string | null,
  };
  if (!wiki.description && !wiki.image_url) {
    ddg = await fetchFromDuckDuckGo(searchQuery + " laboratory equipment");
  }

  const description = wiki.description || ddg.description;
  const image_url = wiki.image_url || ddg.image_url;
  const source = wiki.description
    ? "wikipedia"
    : ddg.description
      ? "duckduckgo"
      : "heuristic";

  return {
    name,
    description,
    image_url,
    item_type: inferItemType(name, description || undefined),
    safety_level: inferSafetyLevel(name, description || undefined),
    source,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

const handler = async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { items } = (await req.json()) as {
      items: Array<{ name: string; brand?: string }>;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "No items provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Limit batch size to prevent abuse
    const batch = items.slice(0, 50);
    console.log(`Enriching ${batch.length} items...`);

    // Process items with concurrency limit (5 at a time)
    const results: EnrichmentResult[] = [];
    const concurrencyLimit = 5;

    for (let i = 0; i < batch.length; i += concurrencyLimit) {
      const chunk = batch.slice(i, i + concurrencyLimit);
      const chunkResults = await Promise.all(
        chunk.map((item) => enrichItem(item.name, item.brand)),
      );
      results.push(...chunkResults);

      // Small delay between chunks to be respectful to APIs
      if (i + concurrencyLimit < batch.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log(
      `Enrichment complete: ${results.filter((r) => r.description).length} descriptions, ${results.filter((r) => r.image_url).length} images found`,
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Enrich error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
};

serve(handler);
