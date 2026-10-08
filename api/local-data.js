import { get, put } from '@vercel/blob';

const DATA_PATH = 'app-data/prompt-tester.json';
const EMPTY_DATA = {
  savedMappings: [],
  goldenSets: [],
  optimizationVersions: [],
};

function sendJson(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'private, no-store');
  response.end(JSON.stringify(body));
}

function normalizeData(data) {
  return {
    ...EMPTY_DATA,
    ...(data && typeof data === 'object' ? data : {}),
    savedMappings: Array.isArray(data?.savedMappings) ? data.savedMappings : [],
    goldenSets: Array.isArray(data?.goldenSets) ? data.goldenSets : [],
    optimizationVersions: Array.isArray(data?.optimizationVersions) ? data.optimizationVersions : [],
  };
}

async function readData() {
  const result = await get(DATA_PATH, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return EMPTY_DATA;
  return normalizeData(JSON.parse(await new Response(result.stream).text()));
}

async function readRequestJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      sendJson(response, await readData());
      return;
    }

    if (request.method === 'PUT') {
      const incomingData = normalizeData(await readRequestJson(request));
      const existingData = await readData();
      const existingMappings = existingData.savedMappings;
      const incomingMappings = incomingData.savedMappings;
      const hasScopedExistingMappings = existingMappings.some((mapping) => mapping.scenarioId);
      const hasScopedIncomingMappings = incomingMappings.some((mapping) => mapping.scenarioId);

      // An older browser tab can still send the former global preset shape.
      // Preserve newer prompt-scoped presets rather than allowing that stale tab to erase them.
      const data = hasScopedExistingMappings && !hasScopedIncomingMappings
        ? { ...incomingData, savedMappings: existingMappings }
        : incomingData;

      await put(DATA_PATH, JSON.stringify(data, null, 2), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });

      response.statusCode = 204;
      response.end();
      return;
    }

    response.statusCode = 405;
    response.setHeader('Allow', 'GET, PUT');
    response.end();
  } catch (error) {
    console.error('Could not access persistent prompt data.', error);
    sendJson(response, { error: 'Could not access persistent prompt data.' }, 500);
  }
}
