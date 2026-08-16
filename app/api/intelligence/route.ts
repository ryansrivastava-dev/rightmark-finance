import { runDeterministicAI, type FinancialContext, type IntelligenceAction, type IntelligenceResult } from "../../../services/aiService";

type OpenAIResponse = { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };

function outputText(response: OpenAIResponse) {
  return response.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
}

export async function POST(request: Request) {
  const payload = await request.json() as { action?: IntelligenceAction; input?: string; context?: FinancialContext };
  const action = payload.action ?? "chat";
  const input = String(payload.input ?? "").slice(0, 20_000);
  const context = payload.context ?? {};
  const fallback = runDeterministicAI(action, input, context);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) return Response.json(fallback);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        input: [
          {
            role: "system",
            content: "You are RightMark Intelligence. Interpret commercial-right records and financial context. Never change, recalculate, or invent financial values. Never imply guaranteed value, approval, return, or safety. Keep explanations specific, concise, and suitable for a regulated FinTech demo. Return only the requested structured output.",
          },
          {
            role: "user",
            content: JSON.stringify({ action, input, immutableFinancialContext: context, deterministicBaseline: fallback }),
          },
        ],
        max_output_tokens: 700,
        text: {
          format: {
            type: "json_schema",
            name: "rightmark_intelligence_annotation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                summary: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 100 },
                additionalRisks: { type: "array", items: { type: "string" }, maxItems: 4 },
              },
              required: ["summary", "confidence", "additionalRisks"],
            },
          },
        },
      }),
    });
    if (!response.ok) return Response.json(fallback);
    const body = await response.json() as OpenAIResponse;
    const text = outputText(body);
    if (!text) return Response.json(fallback);
    const annotation = JSON.parse(text) as { summary: string; confidence: number; additionalRisks: string[] };
    const live: IntelligenceResult = {
      ...fallback,
      mode: "LIVE",
      summary: annotation.summary,
      confidence: Math.max(0, Math.min(100, Math.round(annotation.confidence))),
      risks: [...new Set([...annotation.additionalRisks, ...fallback.risks])].slice(0, 5),
      sources: [...fallback.sources, "OpenAI Responses API structured analysis"],
    };
    return Response.json(live);
  } catch {
    return Response.json(fallback);
  }
}
