import fs from 'node:fs/promises';
import path from 'node:path';

const dataPath = path.resolve('data/prompt-tester.json');
const apiUrl = 'https://ai-prompt-tester-main.vercel.app/api/local-data';
const prefix = 'llm-validation-';

const caseUpdates = {
  'SENTENCE_PRACTICE · DEFAULT · Hello, Pat! (TPSTT17) · Lv2': 'They are eating.',
  'SENTENCE_PRACTICE · DEFAULT · Crunch and Munch (TPSBC206) · Lv5': 'We will need a spoon to prepare the meal.',
  'SENTENCE_PRACTICE · LAST_CHANCE · Hello, Pat! (TPSTT17) · Lv2': "I don't know.",
  'SENTENCE_PRACTICE · LAST_CHANCE · Crunch and Munch (TPSBC206) · Lv5': "I don't know.",
};

const additions = [
  {
    source: 'SENTENCE_PRACTICE · DEFAULT · Hello, Pat! (TPSTT17) · Lv2',
    suffix: '공통 추가 · 문법 오류',
    answer: 'They are talk.',
  },
  {
    source: 'SENTENCE_PRACTICE · DEFAULT · Crunch and Munch (TPSBC206) · Lv5',
    suffix: '공통 추가 · 불완전 문장',
    answer: 'A measuring jug.',
  },
  {
    source: 'SENTENCE_PRACTICE · LAST_CHANCE · Hello, Pat! (TPSTT17) · Lv2',
    suffix: '공통 추가 · 문법 오류',
    answer: 'They are talk.',
  },
  {
    source: 'SENTENCE_PRACTICE · LAST_CHANCE · Crunch and Munch (TPSBC206) · Lv5',
    suffix: '공통 추가 · 불완전 문장',
    answer: 'A measuring jug.',
  },
];

async function getRemoteData() {
  const response = await fetch(`${apiUrl}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load existing app data (${response.status})`);
  return response.json();
}

function updateData(data) {
  const savedMappings = data.savedMappings.map((mapping) => {
    const answer = caseUpdates[mapping.name];
    return answer === undefined
      ? mapping
      : { ...mapping, variables: { ...mapping.variables, 'user-answer': answer } };
  });
  const baseMappings = savedMappings.filter((mapping) => !String(mapping.id).startsWith(`${prefix}sentence-common-`));
  const extraMappings = additions.map((addition, index) => {
    const source = baseMappings.find((mapping) => mapping.name === addition.source);
    if (!source) throw new Error(`Source preset not found: ${addition.source}`);
    return {
      ...source,
      id: `${prefix}sentence-common-${String(index + 1).padStart(2, '0')}`,
      name: `${addition.source} · ${addition.suffix}`,
      description: `${source.description || 'Google Sheet 가져오기'} | 공통 추가 검증 케이스`,
      variables: { ...source.variables, 'user-answer': addition.answer },
    };
  });
  return { ...data, savedMappings: [...baseMappings, ...extraMappings] };
}

async function main() {
  const remote = await getRemoteData();
  const next = updateData(remote);
  await fs.copyFile(dataPath, dataPath.replace(/\.json$/, '.before-sentence-practice-cases.json'));
  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  });
  if (!response.ok) throw new Error(`Could not save app data (${response.status}): ${await response.text()}`);
  await fs.writeFile(dataPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const affected = next.savedMappings.filter((mapping) => mapping.name.startsWith('SENTENCE_PRACTICE') && (mapping.name.includes('· DEFAULT ·') || mapping.name.includes('· LAST_CHANCE ·')));
  console.log(JSON.stringify(affected.map(({ name, variables }) => ({ name, userAnswer: variables['user-answer'] })), null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
