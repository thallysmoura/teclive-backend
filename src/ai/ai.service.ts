import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type AiOptions = { model?: string; temperature?: number; maxTokens?: number; json?: boolean };

/**
 * Integração com a OpenAI (somente no servidor: a chave nunca vai para o navegador).
 * Qualquer módulo pode injetar AiService e chamar chat()/ask() para usar IA numa tela.
 */
@Injectable()
export class AiService {
  private readonly key = process.env.OPENAI_API_KEY;
  private readonly defaultModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  get configured() {
    return !!this.key;
  }

  async chat(messages: AiMessage[], options: AiOptions = {}): Promise<{ text: string; model: string; usage?: { prompt: number; completion: number } }> {
    if (!this.key) throw new ServiceUnavailableException('A integração com IA ainda não foi configurada.');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model ?? this.defaultModel,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 800,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    }).catch(() => { throw new BadGatewayException('Não foi possível falar com o serviço de IA.'); });
    const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; model?: string; usage?: { prompt_tokens: number; completion_tokens: number }; error?: { message?: string } } | null;
    if (!res.ok) throw new BadGatewayException(res.status === 429 ? 'O serviço de IA está sem cota ou ocupado. Tente em instantes.' : `Falha no serviço de IA (${res.status}).`);
    return { text: body?.choices?.[0]?.message?.content?.trim() ?? '', model: body?.model ?? this.defaultModel, usage: body?.usage && { prompt: body.usage.prompt_tokens, completion: body.usage.completion_tokens } };
  }

  /** Atalho: uma pergunta (com instrução opcional de comportamento) e a resposta em texto. */
  async ask(prompt: string, system?: string, options?: AiOptions): Promise<string> {
    return (await this.chat([...(system ? [{ role: 'system' as const, content: system }] : []), { role: 'user', content: prompt }], options)).text;
  }
}
