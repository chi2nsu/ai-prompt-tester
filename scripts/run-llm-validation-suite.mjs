import fs from 'node:fs/promises';
import path from 'node:path';

const runId = process.argv[2] || `llm-validation-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
const sessionCount = 5;
const endpoint = process.env.LLM_VALIDATION_ENDPOINT || 'https://ai-prompt-tester-main.vercel.app';
const dataPath = path.resolve('data/prompt-tester.json');
const outputDir = path.resolve('outputs', 'llm-validation', runId);
const target = path.join(outputDir, 'results.json');

const supportedModels = new Set([
  'gpt-4o-2024-05-13',
  'gpt-4o-2024-11-20',
  'gpt-4o-mini-2024-07-18',
  'gpt-4.1-2025-04-14',
  'gpt-4.1-mini-2025-04-14',
  'gemini-3-flash',
]);

const fillPrompt = (template, variables) => template.replace(/{{\s*([^}]+?)\s*}}/g, (_, key) => String(variables[key.trim()] ?? ''));
const configuredModel = (memo) => {
  const model = String(memo ?? '').split('|').at(-1)?.trim() || '';
  if (model.startsWith('gemini-3-flash-preview')) return { modelId: 'gemini-3-flash', sourceModel: model };
  if (supportedModels.has(model)) return { modelId: model, sourceModel: model };
  if (model === 'gpt-image-1-mini') return { sourceModel: model, reason: '이미지 생성 모델은 텍스트 채팅 API로 실행할 수 없습니다.' };
  if (model === 'gpt-4o-2024-11-20-l') return { sourceModel: model, reason: '앱에 등록되지 않은 모델 ID입니다.' };
  return { sourceModel: model, reason: '앱에 등록되지 않은 모델 ID입니다.' };
};

const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
const scenarios = data.goldenSets.filter((scenario) => scenario.activityName === 'LLM 검증');
const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
const presets = data.savedMappings.filter((preset) => scenarioById.has(preset.scenarioId));
const jobs = presets.flatMap((preset) => Array.from({ length: sessionCount }, (_, index) => ({ preset, session: index + 1 })));

const results = [];
await fs.mkdir(outputDir, { recursive: true });
const writeCheckpoint = async () => {
  await fs.writeFile(target, `${JSON.stringify({ runId, sessionCount, totalJobs: jobs.length + results.length, results }, null, 2)}\n`, 'utf8');
};

async function callModel(payload) {
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/api/model`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) return { raw: body.text ?? body.content ?? body.response ?? JSON.stringify(body), usage: body.usage ?? null };
      lastError = body.error || `Model request failed: ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  throw new Error(lastError);
}

async function runJob({ preset, session }) {
  const scenario = scenarioById.get(preset.scenarioId);
  const model = configuredModel(scenario.memo);
  const base = {
    scenarioId: scenario.id,
    promptName: scenario.name,
    promptRevision: String(scenario.memo ?? '').split('|')[0]?.trim() || '',
    sourceModel: model.sourceModel,
    modelId: model.modelId ?? '',
    presetId: preset.id,
    presetName: preset.name,
    session,
    variables: preset.variables,
  };
  if (!model.modelId) return { ...base, status: 'not-run', error: model.reason, raw: '', usage: null };
  try {
    const response = await callModel({
      modelId: model.modelId,
      messages: [],
      systemPrompt: fillPrompt(scenario.systemPrompt, preset.variables || {}),
      options: model.modelId === 'gemini-3-flash'
        ? { temperature: 0.7, geminiThinkingLevel: 'minimal' }
        : { temperature: 0.7 },
    });
    return { ...base, status: 'success', ...response, error: '' };
  } catch (error) {
    return { ...base, status: 'error', error: error.message, raw: '', usage: null };
  }
}

let completed = 0;
const workerCount = 2;
const workers = Array.from({ length: workerCount }, async () => {
  while (jobs.length) {
    const job = jobs.shift();
    const result = await runJob(job);
    results.push(result);
    completed += 1;
    await writeCheckpoint();
    console.log(`${completed}/${results.length + jobs.length} ${result.status} ${result.promptName} :: ${result.presetName} :: ${result.session}`);
  }
});
await Promise.all(workers);
await writeCheckpoint();
const summary = results.reduce((accumulator, result) => {
  accumulator[result.status] = (accumulator[result.status] ?? 0) + 1;
  return accumulator;
}, {});
console.log(JSON.stringify({ runId, total: results.length, summary, file: target }, null, 2));
