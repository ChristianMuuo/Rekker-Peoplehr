export interface LlmCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCompletionResult {
  usedOpenAi: boolean;
  provider: string;
  model: string;
  content: string | null;
  promptTokens: number;
  completionTokens: number;
  estimatedCostMicros: number; // millionths of USD
  attempts: number;
  fallbackReason?: string;
}

function estimateCostMicros(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  // Approximate pricing rates in USD per 1M tokens (gpt-4o-mini / gpt-4o defaults)
  const isMini = model.includes("mini") || model.includes("nano");
  const inPer1M = isMini ? 0.15 : 2.5;
  const outPer1M = isMini ? 0.6 : 10.0;
  const usd =
    (promptTokens / 1_000_000) * inPer1M +
    (completionTokens / 1_000_000) * outPer1M;
  return Math.round(usd * 1_000_000);
}

function approximateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Calls OpenAI Chat Completions API when OPENAI_API_KEY is configured,
 * with exponential-backoff retries on transient 429/5xx errors and graceful fallback.
 * Never exposes API keys in logs or payloads.
 */
export async function invokeLlmWithRetry(
  req: LlmCompletionRequest,
): Promise<LlmCompletionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.PEOPLEOS_OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    const pt = approximateTokens(req.systemPrompt + req.userPrompt);
    return {
      usedOpenAi: false,
      provider: "Rekker Deterministic Orchestrator",
      model: "tool-grounded-synthesizer-v2",
      content: null,
      promptTokens: pt,
      completionTokens: 0,
      estimatedCostMicros: 0,
      attempts: 1,
      fallbackReason: "OPENAI_API_KEY not configured",
    };
  }

  let lastError = "Unknown OpenAI failure";
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14_000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? 700,
          messages: [
            { role: "system", content: req.systemPrompt },
            { role: "user", content: req.userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const json = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = json.choices?.[0]?.message?.content?.trim() || null;
        const promptTokens =
          json.usage?.prompt_tokens ??
          approximateTokens(req.systemPrompt + req.userPrompt);
        const completionTokens =
          json.usage?.completion_tokens ?? approximateTokens(content || "");

        return {
          usedOpenAi: true,
          provider: "OpenAI",
          model,
          content,
          promptTokens,
          completionTokens,
          estimatedCostMicros: estimateCostMicros(
            model,
            promptTokens,
            completionTokens,
          ),
          attempts: attempt,
        };
      }

      lastError = `OpenAI HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) {
        break; // Non-retryable client error
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Network error";
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
    }
  }

  const pt = approximateTokens(req.systemPrompt + req.userPrompt);
  return {
    usedOpenAi: false,
    provider: "Rekker Deterministic Orchestrator (OpenAI Fallback)",
    model: "tool-grounded-synthesizer-v2",
    content: null,
    promptTokens: pt,
    completionTokens: 0,
    estimatedCostMicros: 0,
    attempts: maxAttempts,
    fallbackReason: lastError,
  };
}
