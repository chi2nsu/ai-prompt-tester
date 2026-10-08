const MODELS = {
  'gpt-6-luna': { realId: 'gpt-6-luna', provider: 'openai', supportsReasoningEffort: true },
  'gpt-5.6-luna': { realId: 'gpt-5.6-luna', provider: 'openai', supportsReasoningEffort: true, supportsVerbosity: true },
  'gpt-5.4-nano': { realId: 'gpt-5.4-nano', provider: 'openai', supportsReasoningEffort: true, supportsVerbosity: true },
  'gpt-5.4-mini': { realId: 'gpt-5.4-mini', provider: 'openai', supportsReasoningEffort: true, supportsVerbosity: true },
  'gemini-3-flash': { realId: 'gemini-3-flash-preview', provider: 'google' },
  'gemini-3.8-flash': { realId: 'gemini-3.8-flash', provider: 'google' },
  'gemini-3.1-flash-lite': { realId: 'gemini-3.1-flash-lite', provider: 'google' },
  'gemini-3.5-flash-lite': { realId: 'gemini-3.5-flash-lite', provider: 'google' },
};

const sendJson = (response, body, status = 200) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
};

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

async function requestJson(url, options) {
  const result = await fetch(url, options);
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(data.error?.message || data.message || 'Model request failed.');
  return data;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405;
    response.setHeader('Allow', 'POST');
    response.end();
    return;
  }

  try {
    const { modelId, messages = [], systemPrompt = '', options = {} } = await readJson(request);
    const model = MODELS[modelId];
    if (!model) throw new Error('Unknown model.');
    if (!Array.isArray(messages) || messages.some((message) => typeof message?.content !== 'string')) {
      throw new Error('Messages must contain text content.');
    }

    if (model.provider === 'openai') {
      if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API key is not configured on the server.');
      const payload = {
        model: model.realId,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          ...messages,
        ],
      };
      if (model.supportsReasoningEffort && options.reasoningEffort && options.reasoningEffort !== 'none') payload.reasoning_effort = options.reasoningEffort;
      if (model.supportsVerbosity && options.verbosity && options.verbosity !== 'none') payload.verbosity = options.verbosity;

      const data = await requestJson('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify(payload),
      });
      sendJson(response, {
        text: data.choices?.[0]?.message?.content || 'No response content',
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      });
      return;
    }

    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API key is not configured on the server.');
    const generationConfig = { temperature: options.temperature ?? 0.7 };
    if (options.geminiThinkingLevel && options.geminiThinkingLevel !== 'none') {
      generationConfig.thinkingConfig = { thinkingLevel: options.geminiThinkingLevel };
    }
    if (options.responseMimeType) generationConfig.responseMimeType = options.responseMimeType;
    const body = {
      contents: (messages.length ? messages : [{ role: 'user', content: ' ' }]).map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      generationConfig,
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    };
    const data = await requestJson(`https://generativelanguage.googleapis.com/v1beta/models/${model.realId}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    sendJson(response, {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response content',
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount || 0,
        outputTokens: (data.usageMetadata?.candidatesTokenCount || 0) + (data.usageMetadata?.thoughtsTokenCount || 0),
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
    });
  } catch (error) {
    console.error('Model request failed.', error);
    sendJson(response, { error: error.message || 'Model request failed.' }, 500);
  }
}
