import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const [, , sourcePath = 'tmp/laura-llm-validation-source.xlsx', ...args] = process.argv;
const dryRun = args.includes('--dry-run');
const dataPath = path.resolve('data/prompt-tester.json');
const apiUrl = 'https://ai-prompt-tester-main.vercel.app/api/local-data';
const activityName = 'LLM 검증';
const prefix = 'llm-validation-';

const clean = (value) => String(value ?? '').trim();
const slug = (value) => clean(value)
  .normalize('NFKD')
  .replace(/[\\u0300-\\u036f]/g, '')
  .replace(/[^a-zA-Z0-9가-힣]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase() || 'item';
const variableName = (value) => clean(value).replace(/^{{\s*|\s*}}$/g, '');
const valueForMapping = (value) => clean(value) === '(비어 있음)' ? '' : String(value ?? '');
const isBlankRow = (row) => row.every((cell) => clean(cell) === '');

function readRows(workbook, sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Missing worksheet: ${sheetName}`);
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
    .filter((row) => !isBlankRow(row));
}

function buildImport(workbook) {
  const promptRows = readRows(workbook, '프롬프트 변수표').slice(1);
  const valueRows = readRows(workbook, '테스트 값').slice(1);
  const scenarios = [];
  const scenarioByKey = new Map();

  promptRows.forEach((row, index) => {
    const sourceActivity = clean(row[0]);
    const promptName = clean(row[1]);
    const systemPrompt = String(row[2] ?? '').trim();
    if (!sourceActivity || !promptName || !systemPrompt) return;
    const id = `${prefix}${String(index + 1).padStart(2, '0')}-${slug(sourceActivity)}-${slug(promptName)}`;
    const key = `${sourceActivity}\u0000${promptName}`;
    const scenario = {
      id,
      name: `${sourceActivity} · ${promptName}`,
      activityName,
      title: `${sourceActivity} · ${promptName}`,
      memo: [clean(row[5]), clean(row[6])].filter(Boolean).join(' | '),
      context: [
        `원본 액티비티: ${sourceActivity}`,
        `원본 프롬프트: ${promptName}`,
        clean(row[4]) ? `변수 설명:\n${clean(row[4])}` : '',
        clean(row[7]) ? `테스트 참고:\n${clean(row[7])}` : '',
      ].filter(Boolean).join('\n\n'),
      systemPrompt,
      testCases: [],
    };
    scenarios.push(scenario);
    scenarioByKey.set(key, scenario);
  });

  const groups = new Map();
  for (const row of valueRows) {
    const sourceActivity = clean(row[0]);
    const promptName = clean(row[1]);
    const level = clean(row[2]) || '기본';
    const book = clean(row[3]) || '공통';
    const variable = variableName(row[4]);
    const scenario = scenarioByKey.get(`${sourceActivity}\u0000${promptName}`);
    if (!scenario || !variable) continue;
    const groupKey = `${scenario.id}\u0000${level}\u0000${book}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        scenario,
        level,
        book,
        rows: [],
        variables: {},
      });
    }
    const group = groups.get(groupKey);
    group.variables[variable] = valueForMapping(row[5]);
    const memo = clean(row[7]);
    if (memo) group.rows.push(memo);
  }

  const seenNames = new Map();
  const mappings = [...groups.values()].map((group, index) => {
    const baseName = `${group.scenario.name} · ${group.book} · ${group.level}`;
    const occurrence = (seenNames.get(baseName) ?? 0) + 1;
    seenNames.set(baseName, occurrence);
    return {
      id: `${prefix}preset-${String(index + 1).padStart(3, '0')}-${slug(group.scenario.id)}-${slug(group.level)}-${slug(group.book)}`,
      name: occurrence === 1 ? baseName : `${baseName} · ${occurrence}`,
      description: ['Google Sheet 가져오기', ...[...new Set(group.rows)].slice(0, 3)].join(' | '),
      scenarioId: group.scenario.id,
      variables: group.variables,
    };
  });
  return { scenarios, mappings };
}

async function getRemoteData() {
  const response = await fetch(`${apiUrl}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load existing app data (${response.status})`);
  return response.json();
}

async function main() {
  const workbook = XLSX.readFile(sourcePath);
  const { scenarios, mappings } = buildImport(workbook);
  const mappedScenarioCount = new Set(mappings.map((mapping) => mapping.scenarioId)).size;
  console.log(JSON.stringify({ scenarios: scenarios.length, presets: mappings.length, mappedScenarioCount }, null, 2));
  if (dryRun) return;

  const remote = await getRemoteData();
  const next = {
    ...remote,
    goldenSets: [...(remote.goldenSets ?? []).filter((item) => !String(item.id).startsWith(prefix)), ...scenarios],
    savedMappings: [...(remote.savedMappings ?? []).filter((item) => !String(item.id).startsWith(prefix)), ...mappings],
  };
  await fs.copyFile(dataPath, dataPath.replace(/\.json$/, '.before-llm-validation-import.json'));
  const put = await fetch(apiUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  });
  if (!put.ok) throw new Error(`Could not save app data (${put.status}): ${await put.text()}`);
  await fs.writeFile(dataPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ saved: true, scenarios: scenarios.length, presets: mappings.length }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
