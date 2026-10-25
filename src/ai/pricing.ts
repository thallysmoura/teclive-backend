/** Preço em dólares por 1 milhão de tokens (entrada, saída) — tabela pública da OpenAI; ajuste aqui se mudar. */
const PRICES: Record<string, [number, number]> = {
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10],
  'gpt-4.1': [2, 8],
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4.1-nano': [0.1, 0.4],
  'gpt-5': [1.25, 10],
  'gpt-5-mini': [0.25, 2],
  'gpt-5-nano': [0.05, 0.4],
};
const FALLBACK: [number, number] = [0.15, 0.6];

export function costUsd(model: string, promptTokens: number, completionTokens: number): number {
  const key = Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => model.startsWith(k));
  const [input, output] = key ? PRICES[key] : FALLBACK;
  return (promptTokens * input + completionTokens * output) / 1_000_000;
}
