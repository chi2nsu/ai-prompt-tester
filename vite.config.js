import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const dataFile = resolve(projectRoot, 'data', 'prompt-tester.json')
const sharedDataFile = resolve(projectRoot, 'data', 'shared-prompt-data.json')

const emptyData = {
  savedMappings: [],
  goldenSets: [],
  optimizationVersions: [],
}

function hasPromptData(data) {
  return Array.isArray(data?.savedMappings) && data.savedMappings.length > 0
    || Array.isArray(data?.goldenSets) && data.goldenSets.length > 0
}

async function readLocalData() {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return emptyData
    throw error
  }
}

async function readSharedData() {
  try {
    return JSON.parse(await readFile(sharedDataFile, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return emptyData
    throw error
  }
}

async function readInitialData() {
  const localData = await readLocalData()
  return hasPromptData(localData) ? localData : readSharedData()
}

function localDataPlugin() {
  return {
    name: 'local-data-store',
    configureServer(server) {
      server.middlewares.use('/api/local-data', async (req, res) => {
        try {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(await readInitialData()))
            return
          }

          if (req.method === 'PUT') {
            let body = ''
            for await (const chunk of req) body += chunk
            const incomingData = JSON.parse(body)
            const existingData = await readLocalData()
            const existingMappings = Array.isArray(existingData.savedMappings) ? existingData.savedMappings : []
            const incomingMappings = Array.isArray(incomingData.savedMappings) ? incomingData.savedMappings : []
            const hasScopedExistingMappings = existingMappings.some(mapping => mapping.scenarioId)
            const hasScopedIncomingMappings = incomingMappings.some(mapping => mapping.scenarioId)
            // An older open browser tab may still send the former global preset shape.
            // Keep the newer prompt-scoped presets rather than letting that stale payload erase them.
            const data = hasScopedExistingMappings && !hasScopedIncomingMappings
              ? { ...incomingData, savedMappings: existingMappings }
              : incomingData
            await mkdir(dirname(dataFile), { recursive: true })
            await writeFile(dataFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
            res.statusCode = 204
            res.end()
            return
          }

          res.statusCode = 405
          res.end()
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localDataPlugin()],
})
