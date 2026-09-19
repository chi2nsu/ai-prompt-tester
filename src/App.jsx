import { useEffect, useState, useRef } from 'react';
import { AVAILABLE_MODELS, fetchAICompletion, evaluateAIResponse, generateAITestCases, generatePromptImprovement, getTodayApiUsage } from './utils/api';
import ManualScenarioSelector from './components/ManualScenarioSelector';
import MultiTurnResults from './components/MultiTurnResults';
import FloatingMultiTurnChat from './components/FloatingMultiTurnChat';
import FloatingSingleTurnRunner from './components/FloatingSingleTurnRunner';
import AutoGenerationSettingsModal from './components/AutoGenerationSettingsModal';
import ModelConfigOptions from './components/ModelConfigOptions';
import GoldenSetAIGenerator from './components/GoldenSetAIGenerator';
import { CONVERSATION_CHAT_CASES, CONVERSATION_CHAT_CASES_VERSION } from './data/conversationChatCases';
import { ENGLISH_QUOTES } from './data/englishQuotes';
import * as XLSX from 'xlsx';

const DEFAULT_ACTIVITIES = [
  'Book Quiz',
  'Meet the Character',
  'Sentence Practice',
  'Talk to a Character',
  'Role-Play',
  'Describe a Picture',
  'Sentence Building',
  'Book Report',
  'Review Quiz'
];

const TEST_CASE_CATEGORIES = ['정상 케이스', '오류 케이스', '엣지 케이스', '안정성 케이스'];
const AUTO_RESPONSE_STYLES = [
  { id: 'thorough', label: 'Thorough', detail: '충실한: 이해도 높음, 답변 성실도 높음', prompt: 'The student understands the character response well. Give a relevant and complete answer with a clear reason, detail, or a natural follow-up question.' },
  { id: 'average', label: 'Average', detail: '평균적: 이해도 중간, 답변 성실도 낮음', prompt: 'The student shows partial understanding. Give a short and somewhat relevant answer with limited detail. A follow-up question is not required.' },
  { id: 'low', label: 'Low', detail: '낮은: 이해도 낮음, 답변 성실도 낮음', prompt: 'The student has low understanding. Give a very short, vague, partially unrelated, or simple answer. Do not make the response fully coherent.' },
  { id: 'playful', label: 'Playful', detail: '장난치는: 이해도 중간, 답변 성실도 낮음', prompt: 'The student understands the basic context but responds playfully, jokingly, or slightly off-topic with little effort. Keep the message child-safe.' },
  { id: 'brief', label: 'Brief', detail: '짧은 답변: 이해도 중간, 매우 짧은 답변', prompt: 'The student understands the basic context but answers in one to three words or one short, simple phrase with minimal effort.' },
];
const DEFAULT_AUTO_CUSTOM_PROMPTS = [
  {
    id: 'short-reply-continuity',
    name: 'Short Reply Continuity',
    commonPrompt: `Act as a 7-year-old CEFR A1 EFL learner. For most turns, reply with a short but interested reaction such as "Oh!", "Really?", "Cool.", "Haha.", "Yes.", or "I see." Stay with the character's current story moment. Do not introduce a new topic just because the character's last message was short. After a few turns, ask one simple related question. Keep most messages to 1-5 words.`,
    variables: {}
  },
  {
    id: 'personal-topic-follow',
    name: 'Personal Topic Follow',
    commonPrompt: `Act as a 7-year-old CEFR A1 EFL learner. After the character begins talking, share a simple personal experience about your own pet, toy, game, or bedtime. Continue that personal topic for at least three turns with short details. Do not claim you were in the character's story or had the same experience. Answer simple questions naturally, then allow a gentle return to the story only after your personal topic has received attention.`,
    variables: {}
  },
  {
    id: 'direct-question-first',
    name: 'Direct Question First',
    commonPrompt: `Act as a curious 8-year-old CEFR A1 EFL learner. Ask direct, easy questions about the character's completed story, such as whether someone was okay, what happened at the end, or where something was found. After each answer, give a short relevant reaction and ask one different follow-up question. Do not ask the character to make you guess facts that the character should already know.`,
    variables: {}
  },
  {
    id: 'unknown-fact-no-invention',
    name: 'Unknown Fact, No Invention',
    commonPrompt: `Act as a curious 8-year-old CEFR A1 EFL learner. Ask for specific story details that may not be provided, such as an exact time, number, color, place, or what happened before the known story. If the character says they do not know, accept the answer with a short reaction and ask a different, safe question. Do not supply missing facts yourself. Keep each message under 10 words.`,
    variables: {}
  },
  {
    id: 'reduce-pressure-after-stuck',
    name: 'Reduce Pressure After Stuck',
    commonPrompt: `Act as a 6-year-old CEFR A1 EFL learner who is sometimes unsure. Start with "Hi." Then answer several questions with short uncertain messages such as "I don't know.", "Hmm.", "Maybe.", "What?", or "I can't say." After repeated questions, stay quiet or say "..." once. Do not invent personal facts to fill the silence. If the character stops asking questions and shares a simple thought, respond with a small relevant reaction.`,
    variables: {}
  }
];
const normalizeTestCaseCategory = (category) => {
  const value = String(category || '').trim().toLowerCase();
  if (value.includes('정상') || value.includes('normal')) return '정상 케이스';
  if (value.includes('오류') || value.includes('에러') || value.includes('error')) return '오류 케이스';
  if (value.includes('엣지') || value.includes('edge')) return '엣지 케이스';
  if (value.includes('안정') || value.includes('safety') || value.includes('security')) return '안정성 케이스';
  return '정상 케이스';
};
const createBulkCaseRows = (count = 1) => Array.from({ length: count }, () => ({
  id: crypto.randomUUID(), category: '정상 케이스', userInput: '', description: ''
}));

const applyConversationChatCaseSet = (sets = []) => sets.map(set => {
  if (set.id !== 'meet-character-conversation' || set.testCaseVersion === CONVERSATION_CHAT_CASES_VERSION) {
    return set;
  }
  return {
    ...set,
    testCaseVersion: CONVERSATION_CHAT_CASES_VERSION,
    testCases: CONVERSATION_CHAT_CASES,
  };
});

const formatVariablePresetSummary = (variables = {}) => {
  const entries = Object.entries(variables);
  const preferredKeys = ['character-name', 'book-title', 'user-name', 'series'];
  const preview = preferredKeys
    .filter(key => variables[key])
    .slice(0, 2)
    .map(key => `${key}: ${variables[key]}`);

  return `${entries.length}개 변수${preview.length ? ` · ${preview.join(' · ')}` : ''}`;
};

const abbreviateVariableValue = (value, maxLength = 72) => {
  const compactValue = String(value || '').replace(/\s+/g, ' ').trim();
  return compactValue.length > maxLength ? `${compactValue.slice(0, maxLength)}…` : compactValue;
};

// The '프롬프트 개선' tab is a 3-step wizard the user can freely jump between
// (each step stays reviewable, it's not a one-way linear flow).
const OPTIMIZATION_STEPS = [
  { key: 'setting', title: '세팅', subtitle: '시나리오 · 프롬프트 · 모델' },
  { key: 'results', title: '테스트 결과 확인', subtitle: '기준 프롬프트 결과 목록' },
  { key: 'compare', title: '프롬프트 개선안 구조', subtitle: '기존 비교 · 이후 구조 비교 · 피드백 현황' }
];

// Line-level LCS diff between the baseline system prompt and the candidate
// system prompt, used to visually highlight what actually changed in the
// '프롬프트 개선안 구조' step (added lines vs removed lines).
const computeLineDiff = (oldText, newText) => {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  const n = oldLines.length;
  const m = newLines.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'same', text: oldLines[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', text: oldLines[i] });
      i++;
    } else {
      result.push({ type: 'added', text: newLines[j] });
      j++;
    }
  }
  while (i < n) { result.push({ type: 'removed', text: oldLines[i] }); i++; }
  while (j < m) { result.push({ type: 'added', text: newLines[j] }); j++; }
  return result;
};

function App() {
  const [conversation, setConversation] = useState('');
  const [prompt, setPrompt] = useState('');
  const [todayApiUsage, setTodayApiUsage] = useState(() => getTodayApiUsage());
  const [isDailyUsageOpen, setIsDailyUsageOpen] = useState(false);
  const [dailyQuoteIndex, setDailyQuoteIndex] = useState(() => Math.floor(Math.random() * ENGLISH_QUOTES.length));
  const dailyUsageCycleRef = useRef(Math.floor(getTodayApiUsage().calls / 10));
  const [promptVariables, setPromptVariables] = useState({});
  const [modelConfigs, setModelConfigs] = useState(() => {
    const initialConfigs = {};
    AVAILABLE_MODELS.forEach(m => {
      initialConfigs[m.id] = {
        ...(m.supportsTemperature !== false ? { temperature: 0.7 } : {}),
        ...(m.provider === 'Google' ? { thinkingLevel: m.defaultThinkingLevel || 'none' } : {}),
        ...(m.provider === 'OpenAI' ? { reasoningEffort: 'none' } : {}),
        ...(m.supportsVerbosity ? { verbosity: 'none' } : {})
      };
    });
    return initialConfigs;
  });
  const [resultCount, setResultCount] = useState(1);
  const [savedMappings, setSavedMappings] = useState(() => {
    try {
      const saved = localStorage.getItem('ai-prompt-mappings');
      return saved ? JSON.parse(saved).map(set => ({
        ...set,
        testCases: (set.testCases || []).map(testCase => ({ ...testCase, category: normalizeTestCaseCategory(testCase.category) }))
      })) : [];
    } catch {
      return [];
    }
  });
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [selectedMultiPresetIds, setSelectedMultiPresetIds] = useState([]);
  const [activeSinglePresetResultId, setActiveSinglePresetResultId] = useState('');
  const [showPresetCreate, setShowPresetCreate] = useState(false);
  const [presetPendingDelete, setPresetPendingDelete] = useState(null);
  
  // Start single-test sessions with the lightweight Gemini model selected.
  const [selectedModels, setSelectedModels] = useState(['gemini-3.5-flash-lite']);
  
  // Results map chat history and loading state per model ID
  // { modelId: { history: [{ role: 'user' | 'assistant', text: '', responseTimeMs: 0 }], loading, error } }
  const [results, setResults] = useState({});
  const [testHistory, setTestHistory] = useState([]);

  // Auto Mode States
  const [activeMode, setActiveMode] = useState('manual'); // 'goldenset' | 'manual' | 'auto'
  const [batchRows, setBatchRows] = useState([]);
  const [batchHeaders, setBatchHeaders] = useState([]);
  const [batchFilename, setBatchFilename] = useState('');
  const [batchIsRunning, setBatchIsRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, percentage: 0, statusText: '' });
  const [batchResults, setBatchResults] = useState([]);
  const abortRef = useRef(false);

  // Golden Set States
  const [goldenSets, setGoldenSets] = useState(() => {
    try {
      const saved = localStorage.getItem('ai-prompt-golden-sets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeGoldenSet, setActiveGoldenSet] = useState({
    id: 'default',
    name: '새 프롬프트 시나리오',
    activityName: 'Book Quiz',
    title: '',
    memo: '',
    context: '',
    systemPrompt: '',
    testCases: []
  });
  const [goldenSetPresetName, setGoldenSetPresetName] = useState('');
  const [goldenSetPresetActivity, setGoldenSetPresetActivity] = useState('Activity 1');
  const [customActivityName, setCustomActivityName] = useState('');
  const [goldenSetGenCount, setGoldenSetGenCount] = useState(2);
  const [goldenSetGenLevel, setGoldenSetGenLevel] = useState('Intermediate');
  const [goldenSetGenModel, setGoldenSetGenModel] = useState('gemini-3-flash');
  const [goldenSetGenLoading, setGoldenSetGenLoading] = useState(false);
  const [goldenSetResults, setGoldenSetResults] = useState([]);
  const [goldenSetIsRunning, setGoldenSetIsRunning] = useState(false);
  const [goldenSetProgress, setGoldenSetProgress] = useState({ current: 0, total: 0, percentage: 0, statusText: '' });
  const [selectedGoldenCases, setSelectedGoldenCases] = useState([]);
  const [newGoldenCaseInput, setNewGoldenCaseInput] = useState('');
  const [newGoldenCaseCategory, setNewGoldenCaseCategory] = useState('정상 케이스');
  const [editingGoldenCaseId, setEditingGoldenCaseId] = useState(null);
  const [editingGoldenCaseText, setEditingGoldenCaseText] = useState('');
  const [goldenSetCompareCaseId, setGoldenSetCompareCaseId] = useState(null);
  const [addToGoldenCase, setAddToGoldenCase] = useState(null);
  const [scenarioSearchQuery, setScenarioSearchQuery] = useState('');
  const [collapsedActivities, setCollapsedActivities] = useState({});
  const [showGoldenVariables, setShowGoldenVariables] = useState(false);
  const [focusedVariableKey, setFocusedVariableKey] = useState(null);

  // Manual Mode checklist & results states
  const [selectedManualCases, setSelectedManualCases] = useState([]);
  const [manualResults, setManualResults] = useState([]);
  const [showManualExportModal, setShowManualExportModal] = useState(false);
  const [manualExportFields, setManualExportFields] = useState({ model: true, preset: true, input: true });
  const [manualExportOutputMode, setManualExportOutputMode] = useState('full');
  const [manualIsRunning, setManualIsRunning] = useState(false);
  // Single tests can be used for quick response checks without sending a second
  // request per response to the AI evaluator.
  const [skipAIEvaluation, setSkipAIEvaluation] = useState(true);
  const [manualProgress, setManualProgress] = useState({ current: 0, total: 0, percentage: 0, statusText: '' });
  const [manualTestMode, setManualTestMode] = useState('single');
  // Each model owns a separate history so its response is never mixed with another model's context.
  const [multiTurnHistories, setMultiTurnHistories] = useState({});
  const [multiTurnSessions, setMultiTurnSessions] = useState({});
  const [multiTurnDrafts, setMultiTurnDrafts] = useState({});
  const [activeMultiTurnSessionKey, setActiveMultiTurnSessionKey] = useState('');
  const [autoTurnCount, setAutoTurnCount] = useState(3);
  const [multiTurnInputMode, setMultiTurnInputMode] = useState('manual');
  const [autoRunAllSessions, setAutoRunAllSessions] = useState(false);
  const [autoGenerationSettings, setAutoGenerationSettings] = useState({
    modelId: 'gemini-3.5-flash-lite',
    level: 'Beginner',
    responseStyle: 'thorough',
    wordCount: 12,
    conversationPartner: 'character',
    promptMode: 'default',
    commonPrompt: '',
    variables: {},
    prompts: {
      Beginner: 'Generate one short, natural CEFR A1 child student message. Use the conversation context when it exists. Return only the student message.',
      Intermediate: 'Generate one natural CEFR B1 student message. Use the conversation context when it exists. Return only the student message.',
      Advance: 'Generate one natural, detailed advanced student message. Use the conversation context when it exists. Return only the student message.',
    },
    customPrompts: DEFAULT_AUTO_CUSTOM_PROMPTS,
    selectedCustomPromptId: DEFAULT_AUTO_CUSTOM_PROMPTS[0].id,
  });
  const [autoGenerationSettingsDraft, setAutoGenerationSettingsDraft] = useState(null);
  const [isAutoGenerationSettingsOpen, setIsAutoGenerationSettingsOpen] = useState(false);
  const [isMultiTurnChatOpen, setIsMultiTurnChatOpen] = useState(false);
  const [isSingleTurnRunnerOpen, setIsSingleTurnRunnerOpen] = useState(true);
  const [isGeneratingMultiTurnMessage, setIsGeneratingMultiTurnMessage] = useState(false);
  const [manualActivityFilter, setManualActivityFilter] = useState('all');

  // Manual case addition form states
  const [manualNewCaseInput, setManualNewCaseInput] = useState('');
  const [manualNewCaseCategory, setManualNewCaseCategory] = useState('정상 케이스');
  const [manualNewCaseDesc, setManualNewCaseDesc] = useState('');
  const [bulkCasePreview, setBulkCasePreview] = useState(() => createBulkCaseRows());

  // Prompt Improvement Workflow states (3rd tab: 'auto')
  const [optimizationIsRunning, setOptimizationIsRunning] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState({
    current: 0, total: 0, percentage: 0, statusText: ''
  });
  const [optimizationBaseline, setOptimizationBaseline] = useState(null);
  const [optimizationCandidate, setOptimizationCandidate] = useState(null);
  const [optimizationCandidatePrompt, setOptimizationCandidatePrompt] = useState('');
  const [optimizationError, setOptimizationError] = useState('');
  const [optimizationVersions, setOptimizationVersions] = useState(() => {
    try {
      const saved = localStorage.getItem('ai-prompt-improvement-versions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Independent scenario selection for '단건 테스트' (manual) and '프롬프트 개선' (optimization).
  // Each tab remembers its own picked scenario id + system prompt text, so choosing a
  // scenario in one tab never changes what the other tab (or the golden-set editor) shows.
  // Test case lists themselves are read-only lookups into `goldenSets` by id — adding,
  // editing, or deleting cases is only done from the '테스트셋 · 골든셋' tab.
  const [manualScenarioId, setManualScenarioId] = useState('default');
  const [manualPrompt, setManualPrompt] = useState('');

  const [optimizationScenarioId, setOptimizationScenarioId] = useState('default');
  const [optimizationPromptText, setOptimizationPromptText] = useState('');
  // Which of the 3 wizard steps ('setting' | 'results' | 'compare') is currently shown.
  // The user can click any step at any time — this only tracks which one is in view.
  const [optimizationStep, setOptimizationStep] = useState('setting');
  const [fileStorageReady, setFileStorageReady] = useState(false);

  useEffect(() => {
    setAutoGenerationSettings(previous => {
      const existingPrompts = previous.customPrompts || [];
      const missingDefaults = DEFAULT_AUTO_CUSTOM_PROMPTS.filter(prompt => !existingPrompts.some(existing => existing.id === prompt.id));
      if (missingDefaults.length === 0 && previous.selectedCustomPromptId) return previous;
      return {
        ...previous,
        customPrompts: [...existingPrompts, ...missingDefaults],
        selectedCustomPromptId: previous.selectedCustomPromptId || DEFAULT_AUTO_CUSTOM_PROMPTS[0].id,
      };
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLocalData = async () => {
      try {
        const response = await fetch('/api/local-data');
        if (!response.ok) throw new Error('Could not load local data');
        const data = await response.json();
        if (cancelled) return;
        if (Array.isArray(data.savedMappings)) {
          setSavedMappings(data.savedMappings);
          const defaultMapping = data.savedMappings.find(mapping => mapping.id === 'meet-character-coco-inputs');
          if (defaultMapping?.variables) {
            setSelectedPresetId(defaultMapping.id);
            setPromptVariables(defaultMapping.variables);
          }
        }
        if (Array.isArray(data.goldenSets)) setGoldenSets(applyConversationChatCaseSet(data.goldenSets));
        if (Array.isArray(data.optimizationVersions)) setOptimizationVersions(data.optimizationVersions);
      } catch (error) {
        console.warn('Local file storage is unavailable; using the existing browser data.', error);
      } finally {
        if (!cancelled) setFileStorageReady(true);
      }
    };

    loadLocalData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!fileStorageReady) return;
    fetch('/api/local-data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedMappings, goldenSets, optimizationVersions }),
    }).catch(error => console.error('Could not save local data.', error));
  }, [fileStorageReady, savedMappings, goldenSets, optimizationVersions]);

  useEffect(() => {
    if (!fileStorageReady) return;
    setGoldenSets(previousSets => applyConversationChatCaseSet(previousSets));
  }, [fileStorageReady]);

  const EMPTY_SCENARIO = { id: 'default', name: '새 프롬프트 시나리오', testCases: [] };
  const manualActiveScenario = manualScenarioId === 'default'
    ? EMPTY_SCENARIO
    : (goldenSets.find(g => g.id === manualScenarioId) || EMPTY_SCENARIO);
  const optimizationActiveScenario = optimizationScenarioId === 'default'
    ? EMPTY_SCENARIO
    : (goldenSets.find(g => g.id === optimizationScenarioId) || EMPTY_SCENARIO);

  const variablePresetScopeId = activeMode === 'goldenset'
    ? activeGoldenSet.id
    : manualActiveScenario.id;

  useEffect(() => {
    const scopedMappings = savedMappings.filter(mapping => mapping.scenarioId === variablePresetScopeId);
    const selectedMapping = scopedMappings.find(mapping => mapping.id === selectedPresetId);
    setSelectedMultiPresetIds(previous => {
      const validIds = previous.filter(id => scopedMappings.some(mapping => mapping.id === id));
      return validIds.length === previous.length ? previous : validIds;
    });
    if (selectedMapping) return;

    const nextMapping = scopedMappings[0];
    setSelectedPresetId(nextMapping?.id || '');
    setPromptVariables(nextMapping?.variables || {});
  }, [variablePresetScopeId, savedMappings, selectedPresetId]);

  useEffect(() => {
    const refreshUsage = event => setTodayApiUsage(event.detail || getTodayApiUsage());
    window.addEventListener('ai-prompt-api-usage', refreshUsage);
    return () => window.removeEventListener('ai-prompt-api-usage', refreshUsage);
  }, []);

  useEffect(() => {
    const nextCycle = Math.floor(todayApiUsage.calls / 10);
    if (nextCycle <= dailyUsageCycleRef.current) return;
    dailyUsageCycleRef.current = nextCycle;
    setDailyQuoteIndex(previous => {
      if (ENGLISH_QUOTES.length < 2) return previous;
      let next = previous;
      while (next === previous) next = Math.floor(Math.random() * ENGLISH_QUOTES.length);
      return next;
    });
  }, [todayApiUsage.calls]);

  // Extract variables enclosed in {{ }} from each tab's own system prompt
  const manualVariablesMatch = [...manualPrompt.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(m => m[1].trim());
  const uniqueManualVariables = [...new Set(manualVariablesMatch)];

  const optimizationVariablesMatch = [...optimizationPromptText.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(m => m[1].trim());
  const uniqueOptimizationVariables = [...new Set(optimizationVariablesMatch)];

  const goldenVariablesMatch = [...activeGoldenSet.systemPrompt.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(m => m[1].trim());
  const uniqueGoldenVariables = [...new Set(goldenVariablesMatch)];

  const handleGenerateBeginnerScript = () => {
    const templates = [
      "Hello! My name is Sarah. I am from Canada.",
      "I like apples and bananas. They are very good.",
      "Excuse me, where is the bathroom, please?",
      "How much is this book? I want to buy it.",
      "It is sunny today. The sky is blue.",
      "I have a dog. He is small and brown."
    ];
    setConversation(templates[Math.floor(Math.random() * templates.length)]);
  };

  const handleGenerateIntermediateScript = () => {
    const templates = [
      "I've been learning English for a few years, but I still struggle with listening to fast speakers.",
      "Could you recommend a good restaurant around here that serves traditional local food?",
      "I usually travel by train because it's much more convenient than driving in the city traffic.",
      "If I had more free time, I would love to learn how to play the acoustic guitar.",
      "In my opinion, reading books is one of the best ways to improve your vocabulary.",
      "Last weekend, I went hiking with my friends and we saw some beautiful scenery."
    ];
    setConversation(templates[Math.floor(Math.random() * templates.length)]);
  };

  const handleVariableChange = (key, value) => {
    setPromptVariables(prev => ({ ...prev, [key]: value }));
    if (selectedPresetId) {
      setSavedMappings(prev => prev.map(mapping => (
        mapping.id === selectedPresetId
          ? { ...mapping, variables: { ...mapping.variables, [key]: value } }
          : mapping
      )));
    }
  };

  const handleSaveMapping = (scenarioId) => {
    if (!presetName.trim()) return;
    const newMapping = { 
      id: crypto.randomUUID(), 
      name: presetName, 
      description: presetDescription.trim(),
      scenarioId,
      variables: { ...promptVariables } 
    };
    const updated = [...savedMappings, newMapping];
    setSavedMappings(updated);
    setSelectedPresetId(newMapping.id);
    localStorage.setItem('ai-prompt-mappings', JSON.stringify(updated));
    setPresetName('');
    setPresetDescription('');
    setShowPresetCreate(false);
  };

  const handleLoadMapping = (mapping) => {
    setSelectedPresetId(mapping.id);
    setPromptVariables(mapping.variables || {});
  };

  const handleSelectSinglePresetResult = (presetId) => {
    setActiveSinglePresetResultId(presetId);
    const mapping = savedMappings.find(item => item.id === presetId);
    if (mapping) handleLoadMapping(mapping);
  };

  const handleDeleteMapping = (id) => {
    const updated = savedMappings.filter(m => m.id !== id);
    setSavedMappings(updated);
    if (selectedPresetId === id) setSelectedPresetId('');
    localStorage.setItem('ai-prompt-mappings', JSON.stringify(updated));
  };

  const handleSelectedPresetMetaChange = (key, value) => {
    if (!selectedPresetId) return;
    setSavedMappings(prev => prev.map(mapping => (
      mapping.id === selectedPresetId ? { ...mapping, [key]: value } : mapping
    )));
  };

  const renderPresetSelector = (scenarioId) => {
    const scenarioMappings = savedMappings.filter(mapping => mapping.scenarioId === scenarioId);
    const selectedPreset = scenarioMappings.find(mapping => mapping.id === selectedPresetId);

    return (
    <div className="mapping-presets" style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>변수 값 프리셋</label>
        <button type="button" className="btn-icon" onClick={() => setShowPresetCreate(previous => !previous)} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
          + 프리셋 추가
        </button>
      </div>
      <select
        value={selectedPresetId}
        onChange={(e) => {
          const mapping = scenarioMappings.find(item => item.id === e.target.value);
          if (mapping) handleLoadMapping(mapping);
          else setSelectedPresetId('');
        }}
        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--surface-border)', backgroundColor: '#111419', color: 'var(--text)', fontSize: '0.8rem' }}
      >
        <option value="">프리셋 선택 안 함</option>
        {scenarioMappings.map(mapping => (
          <option key={mapping.id} value={mapping.id}>
            {mapping.name}{mapping.description ? ` — ${mapping.description}` : ''}
          </option>
        ))}
      </select>
      {selectedPreset && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.8fr) minmax(180px, 1.2fr)', gap: '8px', marginTop: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            이름
            <input
              type="text"
              aria-label="프리셋 이름"
              placeholder="프리셋 이름"
              value={selectedPreset.name}
              onChange={e => handleSelectedPresetMetaChange('name', e.target.value)}
              style={{ minWidth: 0, flex: 1, padding: '7px 8px', fontSize: '0.8rem', backgroundColor: '#111419' }}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>설명</span>
            <input
              type="text"
              aria-label="프리셋 설명"
              placeholder="프리셋 설명"
              value={selectedPreset.description || ''}
              onChange={e => handleSelectedPresetMetaChange('description', e.target.value)}
              style={{ minWidth: 0, flex: 1, padding: '7px 8px', fontSize: '0.8rem', backgroundColor: '#111419' }}
            />
            <button
              type="button"
              className="btn-icon"
              onClick={() => setPresetPendingDelete(selectedPreset)}
              title="선택한 프리셋 삭제"
              style={{ padding: '6px 8px', color: 'var(--error)', flexShrink: 0 }}
            >
              삭제
            </button>
          </div>
        </div>
      )}
      {showPresetCreate && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)' }}>
          <input
            type="text"
            placeholder="프리셋 이름"
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
            style={{ padding: '7px 8px', fontSize: '0.8rem', backgroundColor: '#111419' }}
          />
          <textarea
            rows={2}
            placeholder="프리셋 설명"
            value={presetDescription}
            onChange={e => setPresetDescription(e.target.value)}
            style={{ padding: '7px 8px', fontSize: '0.8rem', backgroundColor: '#111419', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <button type="button" className="btn-icon" onClick={() => { setShowPresetCreate(false); setPresetName(''); setPresetDescription(''); }} style={{ padding: '5px 9px', fontSize: '0.75rem' }}>취소</button>
            <button type="button" className="btn-primary" onClick={() => handleSaveMapping(scenarioId)} disabled={!presetName.trim()} style={{ padding: '5px 9px', fontSize: '0.75rem' }}>저장</button>
          </div>
        </div>
      )}
      {presetPendingDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="preset-delete-title" className="glass-panel" style={{ width: '100%', maxWidth: '380px', padding: '20px', border: '1px solid var(--surface-border)' }}>
            <h3 id="preset-delete-title" style={{ margin: '0 0 10px', fontSize: '1rem' }}>프리셋을 삭제할까요?</h3>
            <p style={{ margin: '0 0 18px', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5' }}>
              <strong style={{ color: 'var(--text-main)' }}>{presetPendingDelete.name}</strong> 프리셋과 저장된 변수값이 삭제됩니다.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn-icon" onClick={() => setPresetPendingDelete(null)} style={{ padding: '7px 12px' }}>취소</button>
              <button type="button" className="btn-primary" onClick={() => { handleDeleteMapping(presetPendingDelete.id); setPresetPendingDelete(null); }} style={{ padding: '7px 12px', background: 'var(--error)', borderColor: 'var(--error)' }}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  };

  const handleToggleModel = (modelId) => {
    setSelectedModels((prev) => 
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  const handleFloatingModelChange = (modelId) => {
    const model = AVAILABLE_MODELS.find(item => item.id === modelId);
    setSelectedModels(modelId ? [modelId] : []);
    if (model?.defaultThinkingLevel) {
      setModelConfigs(previous => ({
        ...previous,
        [modelId]: { ...previous[modelId], thinkingLevel: model.defaultThinkingLevel }
      }));
    }
  };

  const getMultiTurnSessionTemplates = () => selectedModels.flatMap(modelId =>
    Array.from({ length: resultCount }, (_, sessionIndex) => ({
      key: `${modelId}::${sessionIndex}`,
      modelId,
      sessionIndex,
      modelName: AVAILABLE_MODELS.find(model => model.id === modelId)?.name || modelId,
      turns: [],
    }))
  );

  const getMultiTurnRunOptions = (modelId) => {
    const modelInfo = AVAILABLE_MODELS.find(model => model.id === modelId);
    const modelConfig = modelConfigs[modelId] || {};
    const runOptions = {};
    if (modelInfo?.supportsTemperature !== false) runOptions.temperature = modelConfig.temperature ?? 0.7;
    if (modelInfo?.supportsReasoningEffort && modelConfig.reasoningEffort && modelConfig.reasoningEffort !== 'none') runOptions.reasoningEffort = modelConfig.reasoningEffort;
    if (modelInfo?.supportsVerbosity && modelConfig.verbosity && modelConfig.verbosity !== 'none') runOptions.verbosity = modelConfig.verbosity;
    if (modelInfo?.provider === 'Google') runOptions.geminiThinkingLevel = modelConfig.thinkingLevel;
    return runOptions;
  };

  const resolveMultiTurnPrompt = () => manualPrompt.replace(/{{\s*([^}]+?)\s*}}/g, (match, key) => promptVariables[key.trim()] || '');
  const cleanGeneratedStudentMessage = (text) => text.trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/, '').replace(/^['\"]|['\"]$/g, '').trim();

  const getCurrentMultiTurnSessions = () => {
    const savedSessions = Object.values(multiTurnSessions);
    return savedSessions.length > 0 ? savedSessions : getMultiTurnSessionTemplates();
  };

  const handleRunMultiTurn = async (requestedSessionKey = activeMultiTurnSessionKey) => {
    const sessions = getCurrentMultiTurnSessions();
    const session = sessions.find(item => item.key === requestedSessionKey) || sessions[0];
    const draft = multiTurnDrafts[session?.key] || {};
    if (!session || !draft.message?.trim()) return;

    const userInput = draft.message.trim();
    const selectedCase = manualActiveScenario.testCases?.find(testCase => testCase.id === draft.caseId) || null;
    const history = multiTurnHistories[session.key] || [];
    setManualIsRunning(true);
    try {
      const completion = await fetchAICompletion(session.modelId, [...history, { role: 'user', content: userInput }], resolveMultiTurnPrompt(), getMultiTurnRunOptions(session.modelId));
      const response = { text: completion.text, responseTimeMs: completion.responseTimeMs, isError: false };
      setMultiTurnHistories(previous => ({ ...previous, [session.key]: [...(previous[session.key] || []), { role: 'user', content: userInput }, { role: 'assistant', content: response.text }] }));
      setMultiTurnSessions(previous => ({ ...previous, [session.key]: { ...session, turns: [...(previous[session.key]?.turns || []), { id: crypto.randomUUID(), userInput, response, testCase: selectedCase ? { category: selectedCase.category, description: selectedCase.description } : null }] } }));
      setMultiTurnDrafts(previous => ({ ...previous, [session.key]: { message: '', caseId: '' } }));
    } catch (error) {
      const response = { text: error.message || 'Error occurred during generation', isError: true };
      setMultiTurnSessions(previous => ({ ...previous, [session.key]: { ...session, turns: [...(previous[session.key]?.turns || []), { id: crypto.randomUUID(), userInput, response, testCase: selectedCase ? { category: selectedCase.category, description: selectedCase.description } : null }] } }));
    } finally {
      setManualIsRunning(false);
    }
  };

  const handleResetMultiTurnConversation = () => {
    setMultiTurnHistories({});
    setMultiTurnSessions({});
    setMultiTurnDrafts({});
    setActiveMultiTurnSessionKey('');
    setMultiTurnInputMode('manual');
    setAutoRunAllSessions(false);
    setIsMultiTurnChatOpen(false);
  };

  const handleResetSingleTurn = () => {
    setConversation('');
    setManualResults([]);
    setTestHistory([]);
    setActiveSinglePresetResultId('');
    setSelectedManualCases([]);
    setManualProgress({ current: 0, total: 0, percentage: 0, statusText: '' });
  };

  const handleOpenAutoGenerationSettings = () => {
    setAutoGenerationSettingsDraft({
      ...autoGenerationSettings,
      prompts: { ...autoGenerationSettings.prompts },
      variables: { ...(autoGenerationSettings.variables || {}) },
      customPrompts: [...(autoGenerationSettings.customPrompts || [])],
      promptMode: autoGenerationSettings.promptMode || (autoGenerationSettings.level === 'Custom' ? 'custom' : 'default'),
    });
    setIsAutoGenerationSettingsOpen(true);
  };

  const handleSaveAutoGenerationSettings = () => {
    if (!autoGenerationSettingsDraft) return;
    setAutoGenerationSettings({
      ...autoGenerationSettingsDraft,
      commonPrompt: autoGenerationSettingsDraft.commonPrompt || '',
      variables: autoGenerationSettingsDraft.variables || {},
      customPrompts: autoGenerationSettingsDraft.customPrompts || [],
      selectedCustomPromptId: autoGenerationSettingsDraft.selectedCustomPromptId || '',
      promptMode: autoGenerationSettingsDraft.promptMode || 'default',
      level: autoGenerationSettingsDraft.level === 'Custom' ? 'Beginner' : autoGenerationSettingsDraft.level,
    });
    setIsAutoGenerationSettingsOpen(false);
    setAutoGenerationSettingsDraft(null);
  };

  const handleGenerateNextMultiTurnMessage = async () => {
    const session = getCurrentMultiTurnSessions().find(item => item.key === activeMultiTurnSessionKey) || getCurrentMultiTurnSessions()[0];
    const history = multiTurnHistories[session?.key] || [];
    if (!session) return;
    setIsGeneratingMultiTurnMessage(true);
    try {
      const isFirstMessage = history.length === 0;
      const request = isFirstMessage
        ? 'Create one short, natural CEFR A1 child student message to start this role-play.'
        : 'Create one short next message from the student. Continue the latest conversation context and do not repeat the last student message.';
      const instruction = `You simulate a child student in this role-play. Return only the student's message with no label, quotes, JSON, or explanation.${isFirstMessage ? ` Role-play instructions:\n${resolveMultiTurnPrompt()}` : ''}`;
      const completion = await fetchAICompletion(session.modelId, [...history, { role: 'user', content: request }], instruction, getMultiTurnRunOptions(session.modelId));
      const message = cleanGeneratedStudentMessage(completion.text);
      if (message) setMultiTurnDrafts(previous => ({ ...previous, [session.key]: { message, caseId: '' } }));
    } catch (error) {
      alert(`AI 메시지 생성 중 오류가 발생했습니다: ${error.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingMultiTurnMessage(false);
    }
  };

  const handleAutoMultiTurn = async (requestedSessionKeys) => {
    const sessions = getCurrentMultiTurnSessions().filter(session => requestedSessionKeys.includes(session.key));
    if (sessions.length === 0) return;
    const finalPrompt = resolveMultiTurnPrompt();
    const isCustomPromptMode = autoGenerationSettings.promptMode === 'custom';
    const selectedCustomPrompt = autoGenerationSettings.customPrompts?.find(prompt => prompt.id === autoGenerationSettings.selectedCustomPromptId);
    const customVariables = selectedCustomPrompt?.variables || autoGenerationSettings.variables || {};
    const rawGenerationPrompt = isCustomPromptMode
      ? 'Generate one short, natural student message that follows the scenario instructions. Return only the student message.'
      : autoGenerationSettings.prompts[autoGenerationSettings.level];
    const interpolateAutoGenerationPrompt = (value = '') => value.replace(/{{\s*([^}]+?)\s*}}/g, (match, key) => customVariables[key.trim()] ?? '');
    const generationPrompt = interpolateAutoGenerationPrompt(rawGenerationPrompt || 'Generate one short, natural CEFR A1 child student message. Return only the student message.').trim();
    const commonGenerationPrompt = isCustomPromptMode ? interpolateAutoGenerationPrompt(selectedCustomPrompt?.commonPrompt ?? autoGenerationSettings.commonPrompt ?? '').trim() : '';
    const responseStyle = AUTO_RESPONSE_STYLES.find(style => style.id === autoGenerationSettings.responseStyle) || AUTO_RESPONSE_STYLES[0];
    setManualIsRunning(true);
    try {
      const settledSessions = await Promise.allSettled(sessions.map(async session => {
        let history = multiTurnHistories[session.key] || [];
        const newTurns = [];
        for (let turnIndex = 0; turnIndex < autoTurnCount; turnIndex += 1) {
          const isFirstMessage = history.length === 0;
          const studentRequest = isFirstMessage
            ? 'Generate the first student message to start the conversation now.'
            : 'Generate the next student message. Continue the latest conversation context and do not repeat the last student message.';
          const turnInstruction = isFirstMessage
            ? 'This is the first turn. Start the conversation naturally.'
            : 'This is not the first turn. Continue from the latest exchange and never restart the conversation or repeat the previous student message.';
          const partnerLabel = autoGenerationSettings.conversationPartner === 'tutor' ? 'Tutor' : 'Character';
          const wordCount = Math.max(1, Number(autoGenerationSettings.wordCount) || 12);
          const styleInstruction = isCustomPromptMode ? '' : `\n\nResponse style requirement (${responseStyle.label}): ${responseStyle.prompt}`;
          const studentInstruction = `${commonGenerationPrompt ? `Common scenario instructions:\n${commonGenerationPrompt}\n\n` : ''}${generationPrompt}\n\nThe student is talking to a ${partnerLabel}.\nWrite no more than ${wordCount} words.${styleInstruction}\n\n${turnInstruction}\n\nApply these instructions on every turn. Return only the student message with no label, quotes, JSON, or explanation.`;
          const studentCompletion = await fetchAICompletion(autoGenerationSettings.modelId, [...history, { role: 'user', content: studentRequest }], studentInstruction, getMultiTurnRunOptions(autoGenerationSettings.modelId));
          let userInput = cleanGeneratedStudentMessage(studentCompletion.text);
          const lastStudentMessage = [...history].reverse().find(message => message.role === 'user')?.content;
          if (lastStudentMessage && userInput.toLowerCase() === lastStudentMessage.trim().toLowerCase()) {
            const retry = await fetchAICompletion(autoGenerationSettings.modelId, [...history, { role: 'user', content: `Generate a different next student message. Do not repeat: ${lastStudentMessage}` }], `${studentInstruction}\n\nYour previous draft matched the last student message. Choose a clearly different response.`, getMultiTurnRunOptions(autoGenerationSettings.modelId));
            userInput = cleanGeneratedStudentMessage(retry.text);
          }
          if (lastStudentMessage && userInput.toLowerCase() === lastStudentMessage.trim().toLowerCase()) break;
          if (!userInput) break;
          const characterCompletion = await fetchAICompletion(session.modelId, [...history, { role: 'user', content: userInput }], finalPrompt, getMultiTurnRunOptions(session.modelId));
          const response = { text: characterCompletion.text, responseTimeMs: characterCompletion.responseTimeMs, isError: false };
          history = [...history, { role: 'user', content: userInput }, { role: 'assistant', content: response.text }];
          newTurns.push({ id: crypto.randomUUID(), userInput, response, testCase: null });
        }
        return { session, history, newTurns };
      }));
      const completedSessions = settledSessions.filter(result => result.status === 'fulfilled').map(result => result.value);
      setMultiTurnHistories(previous => ({ ...previous, ...Object.fromEntries(completedSessions.map(result => [result.session.key, result.history])) }));
      const failedSessions = settledSessions
        .map((result, index) => result.status === 'rejected'
          ? { session: sessions[index], error: result.reason?.message || 'Unknown error' }
          : null)
        .filter(Boolean);
      setMultiTurnSessions(previous => ({
        ...previous,
        ...Object.fromEntries(completedSessions.map(result => [result.session.key, {
          ...result.session,
          error: '',
          turns: [...(previous[result.session.key]?.turns || []), ...result.newTurns]
        }])),
        ...Object.fromEntries(failedSessions.map(({ session, error }) => [session.key, {
          ...session,
          error,
          turns: previous[session.key]?.turns || []
        }]))
      }));
      if (failedSessions.length > 0) {
        alert(`${failedSessions.length}개 세션의 자동 진행이 완료되지 않았습니다. 결과 탭에서 오류 내용을 확인하세요.\n\n${failedSessions[0].error}`);
      }
    } catch (error) {
      alert(`AI 자동 진행 중 오류가 발생했습니다: ${error.message || 'Unknown error'}`);
    } finally {
      setManualIsRunning(false);
    }
  };

  const multiTurnSessionList = getCurrentMultiTurnSessions();
  const activeMultiTurnSession = multiTurnSessionList.find(session => session.key === activeMultiTurnSessionKey) || multiTurnSessionList[0];
  const multiTurnHasConversation = multiTurnSessionList.some(session => session.turns.length > 0);

  const handleExportMultiTurnExcel = () => {
    const sessionsToExport = multiTurnSessionList.filter(session => session.turns.length > 0);
    if (sessionsToExport.length === 0) {
      alert('현재 화면에 진행 중인 멀티턴 세션이 없습니다. 대화를 진행한 후 엑셀을 내려받아 주세요.');
      return;
    }

    const resolvedPrompt = resolveMultiTurnPrompt();
    const headers = ['프롬프트 정보', '값', ...sessionsToExport.map(session => `${session.modelName} · 세션 ${session.sessionIndex + 1}`)];
    const rows = [
      headers,
      ['프롬프트 이름', manualActiveScenario.title || manualActiveScenario.name || '직접 입력', ...sessionsToExport.map(() => '')],
      ['Activity', manualActiveScenario.activityName || '직접 입력', ...sessionsToExport.map(() => '')],
      ['System Prompt', resolvedPrompt, ...sessionsToExport.map(() => '')],
      ...Object.entries(promptVariables).map(([key, value]) => [`변수 · ${key}`, value, ...sessionsToExport.map(() => '')]),
      [],
      ['대화 순서', '발화 구분', ...sessionsToExport.map(() => '')],
    ];

    const maxTurns = Math.max(...sessionsToExport.map(session => session.turns.length));
    for (let turnIndex = 0; turnIndex < maxTurns; turnIndex += 1) {
      rows.push([`Turn ${turnIndex + 1}`, '유저 발화', ...sessionsToExport.map(session => session.turns[turnIndex]?.userInput || '')]);
      rows.push([`Turn ${turnIndex + 1}`, '캐릭터 발화', ...sessionsToExport.map(session => session.turns[turnIndex]?.response.text || '')]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 18 }, { wch: 42 }, ...sessionsToExport.map(() => ({ wch: 52 }))];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Multi-turn Conversations');
    const date = new Date();
    const dateLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const selectedCustomPrompt = autoGenerationSettings.customPrompts?.find(prompt => prompt.id === autoGenerationSettings.selectedCustomPromptId);
    const promptLabel = autoGenerationSettings.promptMode === 'custom'
      ? selectedCustomPrompt?.name || 'Custom'
      : `Default_${autoGenerationSettings.level || 'Beginner'}`;
    const safePromptLabel = promptLabel.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Prompt';
    XLSX.writeFile(workbook, `${dateLabel}_${safePromptLabel}.xlsx`);
  };

  const handleRun = async () => {
    if (manualTestMode === 'multi') {
      await handleRunMultiTurn();
      return;
    }
    if (selectedModels.length === 0) return;
    if (!manualPrompt.trim() && !conversation.trim() && selectedManualCases.length === 0) return;

    // Determine cases to run
    let casesToRun = [];
    let isCustom = false;
    if (selectedManualCases.length > 0 && manualActiveScenario.id !== 'default') {
      casesToRun = manualActiveScenario.testCases.filter(c => selectedManualCases.includes(c.id));
    }

    if (casesToRun.length === 0) {
      casesToRun = [{
        id: 'custom-input',
        category: '수동 입력',
        userInput: conversation,
        description: conversation.trim() ? '직접 입력한 메시지' : '프롬프트 및 변수만 전송'
      }];
      isCustom = true;
    }

    setManualIsRunning(true);
    abortRef.current = false;
    setManualResults([]);

    const scopedPresets = savedMappings.filter(mapping => mapping.scenarioId === manualActiveScenario.id);
    const selectedMultiPresets = scopedPresets.filter(mapping => selectedMultiPresetIds.includes(mapping.id));
    const presetRuns = selectedMultiPresets.length > 0
      ? selectedMultiPresets.map(mapping => ({ id: mapping.id, name: mapping.name, variables: mapping.variables || {} }))
      : [{
          id: selectedPresetId || 'current-variables',
          name: scopedPresets.find(mapping => mapping.id === selectedPresetId)?.name || '현재 변수',
          variables: { ...promptVariables }
        }];
    setActiveSinglePresetResultId(presetRuns[0].id);

    const totalTasks = casesToRun.length * selectedModels.length * presetRuns.length;
    let completedTasks = 0;

    setManualProgress({
      current: 0,
      total: totalTasks,
      percentage: 0,
      statusText: '평가 시작 중...'
    });

    // Queue case/model work instead of starting the whole test set at once.
    // A full set may contain dozens of cases and several outputs per case;
    // firing all of them concurrently can exhaust the provider quota before
    // the first result reaches the screen.
    const taskFactories = [];

    casesToRun.forEach(testCase => {
      presetRuns.forEach(presetRun => {
        const finalPrompt = manualPrompt.replace(/{{\s*([^}]+?)\s*}}/g, (match, key) => {
          return presetRun.variables[key.trim()] || '';
        });

        selectedModels.forEach(modelId => {
        const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId);
        const modelName = modelInfo ? modelInfo.name : modelId;

        const taskFactory = async () => {
          if (abortRef.current) return;

          try {
            const modelConfig = modelConfigs[modelId] || {};
            const runOptions = {};

            if (modelInfo) {
               if (modelInfo.supportsTemperature !== false) {
                 runOptions.temperature = modelConfig.temperature !== undefined ? modelConfig.temperature : 0.7;
               }
               if (modelInfo.supportsReasoningEffort && modelConfig.reasoningEffort && modelConfig.reasoningEffort !== 'none') {
                 runOptions.reasoningEffort = modelConfig.reasoningEffort;
               }
               if (modelInfo.supportsVerbosity && modelConfig.verbosity && modelConfig.verbosity !== 'none') {
                 runOptions.verbosity = modelConfig.verbosity;
               }
               if (modelInfo.provider === 'Google') {
                 runOptions.geminiThinkingLevel = modelConfig.thinkingLevel;
               }
            }

            // An empty message is intentional for prompt-only checks; the resolved system prompt carries the variables.
            const apiMessages = testCase.userInput.trim() ? [{ role: 'user', content: testCase.userInput }] : [];

            const subPromises = Array.from({ length: resultCount }).map(() =>
              fetchAICompletion(modelId, apiMessages, finalPrompt, runOptions)
            );
            const responses = await Promise.allSettled(subPromises);

            if (abortRef.current) return;

            const generatedResults = await Promise.all(responses.map(async (res, i) => {
              if (res.status === 'fulfilled') {
                let evalData = null;
                if (!skipAIEvaluation && !res.value.text.includes("Error")) {
                  evalData = await evaluateAIResponse(res.value.text, testCase.userInput, finalPrompt);
                }
                return { 
                  text: res.value.text, 
                  responseTimeMs: res.value.responseTimeMs, 
                  isError: false, 
                  index: i + 1, 
                  evaluation: evalData || null 
                };
              } else {
                return { 
                  text: res.reason?.message || 'Error fetching response', 
                  isError: true, 
                  index: i + 1, 
                  evaluation: null 
                };
              }
            }));

            let thinkingValue = 'none';
            if (modelInfo) {
              if (modelInfo.provider === 'OpenAI') {
                const effort = modelConfig.reasoningEffort || 'none';
                const verbosity = modelConfig.verbosity || 'none';
                thinkingValue = `Reasoning ${effort} / Verbosity ${verbosity}`;
              } else if (modelInfo.provider === 'Google') {
                thinkingValue = modelConfig.thinkingLevel || 'none';
              }
            }

            // Calculate cell averages
            const validEvals = generatedResults.filter(r => r.evaluation && !r.isError);
            const ruleScoreAvg = validEvals.length > 0 
              ? validEvals.reduce((acc, r) => acc + (r.evaluation.scores?.coherence !== undefined ? r.evaluation.scores.coherence : (r.evaluation.scores?.rule || 0)), 0) / validEvals.length
              : 0;
            const relevanceScoreAvg = validEvals.length > 0 
              ? validEvals.reduce((acc, r) => acc + (r.evaluation.scores?.relevance || 0), 0) / validEvals.length
              : 0;
            const safetyScoreAvg = validEvals.length > 0 
              ? validEvals.reduce((acc, r) => acc + (r.evaluation.scores?.safety || 0), 0) / validEvals.length
              : 0;
            const totalScoreAvg = validEvals.length > 0 
              ? validEvals.reduce((acc, r) => acc + (r.evaluation.total_avg || 0), 0) / validEvals.length
              : 0;

            const resultItem = {
              id: crypto.randomUUID(),
              presetId: presetRun.id,
              presetName: presetRun.name,
              presetVariables: presetRun.variables,
              caseId: testCase.id,
              category: testCase.category,
              userInput: testCase.userInput,
              modelId: modelId,
              modelName: modelName,
              thinkingLevel: thinkingValue,
              results: generatedResults,
              ruleScore: parseFloat(ruleScoreAvg.toFixed(2)),
              relevanceScore: parseFloat(relevanceScoreAvg.toFixed(2)),
              safetyScore: parseFloat(safetyScoreAvg.toFixed(2)),
              totalScore: parseFloat(totalScoreAvg.toFixed(2)),
              judgeFeedback: validEvals.length > 0 ? validEvals[0].evaluation.reason : '평가 불가',
              isError: generatedResults.every(r => r.isError)
            };

            setManualResults(prev => [...prev, resultItem]);

            // Add history items for Excel export
            generatedResults.forEach(r => {
              const newHistoryItem = {
                timestamp: new Date().toLocaleString(),
                presetId: presetRun.id,
                presetName: presetRun.name,
                systemPrompt: finalPrompt,
                userInput: testCase.userInput,
                modelName: modelName,
                thinkingLevel: thinkingValue,
                aiOutput: r.text || '',
                ruleScore: r.evaluation?.scores?.coherence !== undefined ? r.evaluation.scores.coherence : (r.evaluation?.scores?.rule || 0),
                relevanceScore: r.evaluation?.scores?.relevance || 0,
                safetyScore: r.evaluation?.scores?.safety || 0,
                totalScore: r.evaluation?.total_avg || 0,
                judgeFeedback: r.evaluation?.reason || ''
              };
              setTestHistory(prev => [...prev, newHistoryItem]);
            });

          } catch (error) {
            console.error(`Error processing manual case with model ${modelId}:`, error);
            const errorResult = {
              id: crypto.randomUUID(),
              presetId: presetRun.id,
              presetName: presetRun.name,
              presetVariables: presetRun.variables,
              caseId: testCase.id,
              category: testCase.category,
              userInput: testCase.userInput,
              modelId: modelId,
              modelName: modelName,
              thinkingLevel: '-',
              results: [{ text: error.message || 'Error occurred during generation', isError: true, index: 1, evaluation: null }],
              ruleScore: 0,
              relevanceScore: 0,
              safetyScore: 0,
              totalScore: 0,
              judgeFeedback: '에러 발생',
              isError: true
            };
            setManualResults(prev => [...prev, errorResult]);
          } finally {
            completedTasks++;
            setManualProgress(prev => ({
              ...prev,
              current: completedTasks,
              percentage: Math.round((completedTasks / totalTasks) * 100),
              statusText: `평가 진행 중... (${completedTasks}/${totalTasks})`
            }));
          }
        };

        taskFactories.push(taskFactory);
        });
      });
    });

    const maxConcurrentTasks = 2;
    let nextTaskIndex = 0;
    const workers = Array.from(
      { length: Math.min(maxConcurrentTasks, taskFactories.length) },
      async () => {
        while (nextTaskIndex < taskFactories.length && !abortRef.current) {
          const taskIndex = nextTaskIndex++;
          await taskFactories[taskIndex]();
        }
      }
    );
    await Promise.allSettled(workers);

    setManualIsRunning(false);
    if (!abortRef.current) {
      setManualProgress(prev => ({
        ...prev,
        statusText: `평가 완료! 총 ${casesToRun.length}개 케이스 평가가 완료되었습니다.`
      }));
    }

    if (isCustom) {
      setConversation('');
    }
  };

  const handleCopyScores = (evaluation) => {
    if (!evaluation) return;
    const scores = evaluation.scores || {};
    const coherence = scores.coherence !== undefined ? scores.coherence : (scores.rule || 0);
    const relevance = scores.relevance || 0;
    const safety = scores.safety || 0;
    const total = evaluation.total_avg || 0;
    const reason = evaluation.reason || '';
    
    // Tab-separated text format (TSV) is perfectly copied as distinct columns in Excel
    const headers = "Coherence (일관성)\tRelevance (관련성)\tConstraints & Safety (제약 사항 및 안전성)\tAverage Score (평균)\tJudge Feedback (평가 피드백)";
    const values = `${coherence}\t${relevance}\t${safety}\t${total}\t${reason}`;
    const tsv = `${headers}\n${values}`;
    
    navigator.clipboard.writeText(tsv).then(() => {
      alert("평가 점수와 피드백이 엑셀에 붙여넣기 좋은 탭(Tab) 구분 형식으로 클립보드에 복사되었습니다! 엑셀 시트에 붙여넣기(Ctrl+V) 하시면 각 셀에 맞게 입력됩니다.");
    }).catch(err => {
      console.error("클립보드 복사 실패:", err);
      alert("클립보드 복사에 실패했습니다.");
    });
  };

  const handleExportExcel = () => {
    if (manualResults.length === 0) {
      alert("현재 화면에 표시된 결과가 없습니다. 평가를 실행한 후에 엑셀 다운로드를 진행해 주세요.");
      return;
    }
    setShowManualExportModal(true);
  };

  const getResultDataOnly = (text) => {
    const formatDataValue = (value) => {
      if (Array.isArray(value)) return value.map(formatDataValue).join(', ');
      if (value && typeof value === 'object') {
        return Object.entries(value).map(([key, nestedValue]) => `${key}: ${formatDataValue(nestedValue)}`).join(' | ');
      }
      return value === null || value === undefined ? '' : String(value);
    };

    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, formatDataValue(value)]));
      }
      return { '결과 데이터': formatDataValue(parsed) };
    } catch {
      return { '결과 데이터': text || '' };
    }
  };

  const handleExportAllManualResults = () => {
    // Include every preset run, not only the result tab currently visible on screen.
    const sortedManualResults = [...manualResults].sort((a, b) => {
      const idxA = manualActiveScenario.testCases.findIndex(c => c.id === a.caseId);
      const idxB = manualActiveScenario.testCases.findIndex(c => c.id === b.caseId);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    const dataToExport = [];

    sortedManualResults.forEach(item => {
      if (item.results && item.results.length > 0) {
        item.results.forEach(res => {
          const row = {};
          if (manualExportFields.model) row['모델 선택 값'] = item.modelName;
          if (manualExportFields.preset) row['프리셋 이름 값'] = item.presetName || '현재 변수';
          if (manualExportFields.input) row['Input message 값'] = item.userInput;

          if (manualExportOutputMode === 'data-only') {
            dataToExport.push({ ...row, ...getResultDataOnly(res.text) });
            return;
          }

          const coherence = res.evaluation?.scores?.coherence !== undefined ? res.evaluation.scores.coherence : (res.evaluation?.scores?.rule || 0);
          const relevance = res.evaluation?.scores?.relevance || 0;
          const safety = res.evaluation?.scores?.safety || 0;
          const total = res.evaluation?.total_avg || 0;
          const reason = res.evaluation?.reason || '';

          dataToExport.push({ ...row,
            '테스트 세트 분류': item.category,
            '사고 레벨': item.thinkingLevel || '-',
            'Response 회차': `Response ${res.index}`,
            'AI Output': res.text || '',
            'Coherence (일관성)': coherence,
            'Relevance (관련성)': relevance,
            'Constraints & Safety (제약 사항 및 안전성)': safety,
            'Average Score (평균)': total,
            'Judge Feedback (평가 피드백)': reason
          });
        });
      } else {
        const row = {};
        if (manualExportFields.model) row['모델 선택 값'] = item.modelName;
        if (manualExportFields.preset) row['프리셋 이름 값'] = item.presetName || '현재 변수';
        if (manualExportFields.input) row['Input message 값'] = item.userInput;

        if (manualExportOutputMode === 'data-only') {
          dataToExport.push({ ...row, ...getResultDataOnly(item.aiOutput || 'Error occurred') });
          return;
        }

        dataToExport.push({ ...row,
          '테스트 세트 분류': item.category,
          '사고 레벨': item.thinkingLevel || '-',
          'Response 회차': 'N/A',
          'AI Output': item.aiOutput || 'Error occurred',
          'Coherence (일관성)': item.ruleScore,
          'Relevance (관련성)': item.relevanceScore,
          'Constraints & Safety (제약 사항 및 안전성)': item.safetyScore,
          'Average Score (평균)': item.totalScore,
          'Judge Feedback (평가 피드백)': item.judgeFeedback
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Single-turn Results");
    XLSX.writeFile(workbook, `Single_Turn_All_Results_${new Date().getTime()}.xlsx`);
    setShowManualExportModal(false);
  };

  // Calculate model averages for the dashboard
  const getModelAverages = () => {
    const averages = {};
    testHistory.forEach(item => {
      if (!averages[item.modelName]) {
        averages[item.modelName] = { total: 0, count: 0, rule: 0, relevance: 0, safety: 0 };
      }
      if (item.totalScore > 0) {
        averages[item.modelName].total += item.totalScore;
        averages[item.modelName].rule += item.ruleScore;
        averages[item.modelName].relevance += item.relevanceScore;
        averages[item.modelName].safety += item.safetyScore;
        averages[item.modelName].count += 1;
      }
    });

    return Object.fromEntries(
      Object.entries(averages).map(([key, val]) => [
        key,
        val.count > 0 ? {
          total: (val.total / val.count).toFixed(2),
          rule: (val.rule / val.count).toFixed(2),
          relevance: (val.relevance / val.count).toFixed(2),
          safety: (val.safety / val.count).toFixed(2),
        } : null
      ]).filter(entry => entry[1] !== null)
    );
  };

  const modelAverages = getModelAverages();

  // Calculate manual model averages for the dashboard
  const getManualModelAverages = (resultItems = manualResults) => {
    const averages = {};
    resultItems.forEach(item => {
      if (!averages[item.modelName]) {
        averages[item.modelName] = { total: 0, count: 0, rule: 0, relevance: 0, safety: 0 };
      }
      if (item.totalScore > 0 && !item.isError) {
        averages[item.modelName].total += item.totalScore;
        averages[item.modelName].rule += item.ruleScore;
        averages[item.modelName].relevance += item.relevanceScore;
        averages[item.modelName].safety += item.safetyScore;
        averages[item.modelName].count += 1;
      }
    });

    return Object.fromEntries(
      Object.entries(averages).map(([key, val]) => [
        key,
        val.count > 0 ? {
          total: (val.total / val.count).toFixed(2),
          rule: (val.rule / val.count).toFixed(2),
          relevance: (val.relevance / val.count).toFixed(2),
          safety: (val.safety / val.count).toFixed(2),
        } : null
      ]).filter(entry => entry[1] !== null)
    );
  };

  const singlePresetResultTabs = manualTestMode === 'single'
    ? Array.from(new Map(manualResults.map(result => [result.presetId || 'current-variables', {
        id: result.presetId || 'current-variables',
        name: result.presetName || '현재 변수',
        count: 0
      }])).values()).map(tab => ({
        ...tab,
        count: manualResults.filter(result => (result.presetId || 'current-variables') === tab.id).length
      }))
    : [];
  const activeSinglePresetResult = singlePresetResultTabs.find(tab => tab.id === activeSinglePresetResultId) || singlePresetResultTabs[0];
  const visibleManualResults = activeSinglePresetResult
    ? manualResults.filter(result => (result.presetId || 'current-variables') === activeSinglePresetResult.id)
    : manualResults;
  const manualModelAverages = getManualModelAverages(visibleManualResults);

  // --- Auto Mode Helper Functions ---
  const getRowInput = (row, headers) => {
    const possibleKeys = ['user input', 'input', 'conversation', 'script', 'text', '발화'];
    for (const key of headers) {
      if (possibleKeys.includes(key.toLowerCase())) {
        return row[key];
      }
    }
    return row[headers[0]] || '';
  };

  const resolveSystemPrompt = (systemPromptTemplate, row) => {
    return systemPromptTemplate.replace(/{{\s*([^}]+?)\s*}}/g, (match, key) => {
      const cleanKey = key.trim();
      if (row[cleanKey] !== undefined) {
        return row[cleanKey];
      }
      const foundKey = Object.keys(row).find(k => k.toLowerCase() === cleanKey.toLowerCase());
      return foundKey ? row[foundKey] : '';
    });
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setBatchFilename(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if (data.length === 0) {
          alert("업로드된 엑셀 파일에 데이터가 없습니다.");
          return;
        }

        setBatchRows(data);
        setBatchHeaders(Object.keys(data[0]));
        setBatchResults([]);
        setBatchProgress({ current: 0, total: data.length, percentage: 0, statusText: '파일이 성공적으로 업로드되었습니다.' });
      } catch (err) {
        console.error("Excel parse error:", err);
        alert("엑셀 파일을 파싱하는 데 실패했습니다. 파일 형식을 확인해 주세요.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        handleExcelUpload({ target: { files: [file] } });
      } else {
        alert("엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.");
      }
    }
  };

  const handleStopBatch = () => {
    abortRef.current = true;
    setBatchIsRunning(false);
    setBatchProgress(prev => ({ ...prev, statusText: '사용자에 의해 배치가 중단되었습니다.' }));
  };

  const handleRunBatch = async () => {
    if (selectedModels.length === 0) {
      alert("평가할 모델을 하나 이상 선택해 주세요.");
      return;
    }
    if (batchRows.length === 0) {
      alert("업로드된 엑셀 데이터가 없습니다.");
      return;
    }

    setBatchIsRunning(true);
    abortRef.current = false;
    setBatchResults([]);

    const totalRows = batchRows.length;
    let completedResults = [];

    for (let i = 0; i < totalRows; i++) {
      if (abortRef.current) break;

      const row = batchRows[i];
      const rowInput = getRowInput(row, batchHeaders);
      const finalPrompt = resolveSystemPrompt(prompt, row);

      setBatchProgress({
        current: i + 1,
        total: totalRows,
        percentage: Math.round(((i + 1) / totalRows) * 100),
        statusText: `행 ${i + 1} / ${totalRows} 처리 중...`
      });

      const rowVariables = {};
      batchHeaders.forEach(h => {
        const lowerH = h.toLowerCase();
        if (lowerH !== 'user input' && lowerH !== 'input' && lowerH !== 'conversation' && lowerH !== 'script') {
          rowVariables[h] = row[h];
        }
      });

      for (const modelId of selectedModels) {
        if (abortRef.current) break;

        const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId);
        const modelName = modelInfo ? modelInfo.name : modelId;

        setBatchProgress(prev => ({
          ...prev,
          statusText: `행 ${i + 1} / ${totalRows} - ${modelName} 호출 중...`
        }));

        try {
          const modelConfig = modelConfigs[modelId] || {};
          const runOptions = {};
          
          if (modelInfo) {
             if (modelInfo.supportsTemperature !== false) {
               runOptions.temperature = modelConfig.temperature !== undefined ? modelConfig.temperature : 0.7;
             }
             if (modelInfo.supportsReasoningEffort && modelConfig.reasoningEffort && modelConfig.reasoningEffort !== 'none') {
               runOptions.reasoningEffort = modelConfig.reasoningEffort;
             }
             if (modelInfo.supportsVerbosity && modelConfig.verbosity && modelConfig.verbosity !== 'none') {
               runOptions.verbosity = modelConfig.verbosity;
             }
             if (modelInfo.provider === 'Google') {
               runOptions.geminiThinkingLevel = modelConfig.thinkingLevel;
             }
          }

          const start = Date.now();
          const response = await fetchAICompletion(modelId, [{ role: 'user', content: rowInput }], finalPrompt, runOptions);
          const end = Date.now();
          const responseTimeMs = end - start;

          setBatchProgress(prev => ({
            ...prev,
            statusText: `행 ${i + 1} / ${totalRows} - ${modelName} 결과 AI 채점 중...`
          }));

          let evalData = null;
          if (response && response.text && !response.text.includes("Error")) {
            evalData = await evaluateAIResponse(response.text, rowInput, finalPrompt);
          }

          let thinkingValue = 'none';
          if (modelInfo) {
            if (modelInfo.provider === 'OpenAI') {
              const effort = modelConfig.reasoningEffort || 'none';
              const verbosity = modelConfig.verbosity || 'none';
              thinkingValue = `Reasoning ${effort} / Verbosity ${verbosity}`;
            } else if (modelInfo.provider === 'Google') {
              thinkingValue = modelConfig.thinkingLevel || 'none';
            }
          }

          const resultItem = {
            id: crypto.randomUUID(),
            rowIndex: i + 1,
            systemPrompt: finalPrompt,
            userInput: rowInput,
            variables: rowVariables,
            modelId: modelId,
            modelName: modelName,
            thinkingLevel: thinkingValue,
            aiOutput: response ? response.text : 'Error fetching response',
            responseTimeMs: responseTimeMs,
            ruleScore: evalData?.scores?.coherence !== undefined ? evalData.scores.coherence : (evalData?.scores?.rule || 0),
            relevanceScore: evalData?.scores?.relevance || 0,
            safetyScore: evalData?.scores?.safety || 0,
            totalScore: evalData?.total_avg || 0,
            judgeFeedback: evalData?.reason || '채점 실패',
            isError: !response || response.text.includes("Error")
          };

          completedResults.push(resultItem);
          setBatchResults([...completedResults]);

        } catch (error) {
          console.error(`Error processing row ${i + 1} with model ${modelId}:`, error);
          const errorResult = {
            id: crypto.randomUUID(),
            rowIndex: i + 1,
            systemPrompt: finalPrompt,
            userInput: rowInput,
            variables: rowVariables,
            modelId: modelId,
            modelName: modelName,
            thinkingLevel: '-',
            aiOutput: error.message || 'Error occurred during generation',
            responseTimeMs: 0,
            ruleScore: 0,
            relevanceScore: 0,
            safetyScore: 0,
            totalScore: 0,
            judgeFeedback: '에러 발생',
            isError: true
          };
          completedResults.push(errorResult);
          setBatchResults([...completedResults]);
        }
      }
    }

    setBatchIsRunning(false);
    if (!abortRef.current) {
      setBatchProgress(prev => ({
        ...prev,
        statusText: `배치 완료! 총 ${totalRows}개 행의 평가가 완료되었습니다.`
      }));
    }
  };

  const handleExportBatchExcel = () => {
    if (batchResults.length === 0) {
      alert("내보낼 평가 결과가 없습니다.");
      return;
    }

    // Sort by rowIndex first, then by AVAILABLE_MODELS order
    const sortedResults = [...batchResults].sort((a, b) => {
      const idxA = AVAILABLE_MODELS.findIndex(m => m.name === a.modelName || m.id === a.modelId || m.id === a.modelName);
      const idxB = AVAILABLE_MODELS.findIndex(m => m.name === b.modelName || m.id === b.modelId || m.id === b.modelName);
      if (idxA !== idxB) {
        return idxA - idxB;
      }
      return a.rowIndex - b.rowIndex;
    });

    const dataToExport = sortedResults.map(item => {
      return {
        '행 번호': item.rowIndex,
        ...item.variables,
        'Model Name': item.modelName,
        '사고 레벨': item.thinkingLevel || '-',
        'User Input': item.userInput,
        'AI Output': item.aiOutput,
        'Coherence (일관성)': item.ruleScore,
        'Relevance (관련성)': item.relevanceScore,
        'Constraints & Safety (제약 사항 및 안전성)': item.safetyScore,
        'Average Score (평균)': item.totalScore,
        'Judge Feedback (평가 피드백)': item.judgeFeedback,
        '응답 속도 (초)': (item.responseTimeMs / 1000).toFixed(2)
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Batch Evaluation Results");
    XLSX.writeFile(workbook, `AI_Batch_Evaluation_${new Date().getTime()}.xlsx`);
  };

  const getBatchModelAverages = () => {
    const averages = {};
    batchResults.forEach(item => {
      if (!averages[item.modelName]) {
        averages[item.modelName] = { total: 0, count: 0, rule: 0, relevance: 0, safety: 0 };
      }
      if (item.totalScore > 0 && !item.isError) {
        averages[item.modelName].total += item.totalScore;
        averages[item.modelName].rule += item.ruleScore;
        averages[item.modelName].relevance += item.relevanceScore;
        averages[item.modelName].safety += item.safetyScore;
        averages[item.modelName].count += 1;
      }
    });

    return Object.fromEntries(
      Object.entries(averages).map(([key, val]) => [
        key,
        val.count > 0 ? {
          total: (val.total / val.count).toFixed(2),
          rule: (val.rule / val.count).toFixed(2),
          relevance: (val.relevance / val.count).toFixed(2),
          safety: (val.safety / val.count).toFixed(2),
          count: val.count
        } : null
      ]).filter(entry => entry[1] !== null)
    );
  };

  const batchModelAverages = getBatchModelAverages();

  // --- Golden Set Helper Functions ---

  const saveActiveScenarioState = (activeSet, currentPresetName) => {
    if (!activeSet || activeSet.id === 'default') return;
    const nameToSave = currentPresetName.trim() || activeSet.name;
    const suiteToSave = {
      ...activeSet,
      name: nameToSave,
      activityName: activeSet.activityName?.trim() || 'Book Quiz',
      title: activeSet.title || ''
    };
    setGoldenSets(prev => {
      const exists = prev.some(g => g.id === activeSet.id);
      let updated;
      if (exists) {
        updated = prev.map(g => g.id === activeSet.id ? suiteToSave : g);
      } else {
        updated = [...prev, suiteToSave];
      }
      localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updated));
      return updated;
    });
  };

  const handleDeleteGoldenCase = (id) => {
    setActiveGoldenSet(prev => {
      const updatedCases = prev.testCases.filter(c => c.id !== id);
      const updatedSuite = { ...prev, testCases: updatedCases };
      if (prev.id !== 'default') {
        setGoldenSets(prevSets => {
          const updated = prevSets.map(g => g.id === prev.id ? updatedSuite : g);
          localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updated));
          return updated;
        });
      }
      return updatedSuite;
    });
    setSelectedGoldenCases(prev => prev.filter(cid => cid !== id));
    setSelectedManualCases(prev => prev.filter(cid => cid !== id));
  };

  const handleStartEditGoldenCase = (id, text) => {
    setEditingGoldenCaseId(id);
    setEditingGoldenCaseText(text);
  };

  const handleSaveEditGoldenCase = () => {
    if (!editingGoldenCaseText.trim()) return;
    setActiveGoldenSet(prev => {
      const updatedCases = prev.testCases.map(c => 
        c.id === editingGoldenCaseId ? { ...c, userInput: editingGoldenCaseText } : c
      );
      const updatedSuite = { ...prev, testCases: updatedCases };
      if (prev.id !== 'default') {
        setGoldenSets(prevSets => {
          const updated = prevSets.map(g => g.id === prev.id ? updatedSuite : g);
          localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updated));
          return updated;
        });
      }
      return updatedSuite;
    });
    setEditingGoldenCaseId(null);
    setEditingGoldenCaseText('');
  };

  const handleGenerateGoldenSetAI = async () => {
    if (!activeGoldenSet.systemPrompt.trim()) {
      alert("평가 대상이 되는 프롬프트(System Prompt)를 입력해주세요.");
      return;
    }
    setGoldenSetGenLoading(true);
    try {
      const result = await generateAITestCases(
        activeGoldenSet.systemPrompt,
        goldenSetGenCount,
        activeGoldenSet.context,
        goldenSetGenLevel,
        goldenSetGenModel
      );
      if (result && Array.isArray(result)) {
        const formatted = result.map(c => ({
          id: crypto.randomUUID(),
          category: normalizeTestCaseCategory(c.category),
          userInput: c.userInput || '',
          description: c.description || ''
        }));
        setActiveGoldenSet(prev => {
          const updatedCases = [...prev.testCases, ...formatted];
          const updatedSuite = { ...prev, testCases: updatedCases };
          if (prev.id !== 'default') {
            setGoldenSets(prevSets => {
              const updated = prevSets.map(g => g.id === prev.id ? updatedSuite : g);
              localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updated));
              return updated;
            });
          }
          return updatedSuite;
        });
        setSelectedGoldenCases(prev => [...prev, ...formatted.map(c => c.id)]);
      } else {
        alert("API에서 올바른 형식의 응답을 받지 못했습니다. 다시 시도해 주세요.");
      }
    } catch (error) {
      console.error(error);
      alert("AI 테스트 케이스 생성 중 에러가 발생했습니다: " + error.message);
    } finally {
      setGoldenSetGenLoading(false);
    }
  };

  const handleSaveGoldenPreset = () => {
    if (!goldenSetPresetName.trim()) return;
    
    const id = activeGoldenSet.id === 'default' ? crypto.randomUUID() : activeGoldenSet.id;
    const suiteToSave = {
      ...activeGoldenSet,
      id,
      name: goldenSetPresetName.trim(),
      activityName: activeGoldenSet.activityName?.trim() || 'Book Quiz',
      title: activeGoldenSet.title || ''
    };

    let updatedPresets;
    const exists = goldenSets.some(g => g.id === id);
    if (exists) {
      updatedPresets = goldenSets.map(g => g.id === id ? suiteToSave : g);
    } else {
      updatedPresets = [...goldenSets, suiteToSave];
    }

    setGoldenSets(updatedPresets);
    localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updatedPresets));
    setActiveGoldenSet(suiteToSave);
    setGoldenSetPresetName(suiteToSave.name);
    alert("시나리오 프리셋이 저장되었습니다.");
  };

  const handleLoadGoldenPreset = (preset) => {
    saveActiveScenarioState(activeGoldenSet, goldenSetPresetName);

    setActiveGoldenSet({
      id: preset.id,
      name: preset.name,
      activityName: preset.activityName || 'Book Quiz',
      title: preset.title || '',
      memo: preset.memo || '',
      context: preset.context || '',
      systemPrompt: preset.systemPrompt || '',
      testCases: preset.testCases || []
    });
    setPrompt(preset.systemPrompt || ''); // Sync prompt
    setGoldenSetPresetName(preset.name);
    setSelectedGoldenCases((preset.testCases || []).map(c => c.id));
    setSelectedManualCases((preset.testCases || []).map(c => c.id));
    setGoldenSetResults([]);
  };

  const handleDeleteGoldenPreset = (id) => {
    const updated = goldenSets.filter(g => g.id !== id);
    setGoldenSets(updated);
    localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updated));
    if (activeGoldenSet.id === id) {
      setActiveGoldenSet({
        id: 'default',
        name: '새 프롬프트 시나리오',
        activityName: 'Book Quiz',
        title: '',
        memo: '',
        context: '',
        systemPrompt: '',
        testCases: []
      });
      setPrompt(''); // Sync prompt
      setGoldenSetPresetName('');
      setSelectedGoldenCases([]);
      setSelectedManualCases([]);
    }
  };

  const handleSaveAddToGolden = (scenarioId, category, userInput, description) => {
    const newCase = {
      id: crypto.randomUUID(),
      category,
      userInput,
      description: description || '실행 결과에서 추가됨'
    };

    if (scenarioId === 'default' || scenarioId === activeGoldenSet.id) {
      setActiveGoldenSet(prev => {
        const updatedCases = [...prev.testCases, newCase];
        if (prev.id !== 'default') {
          const updatedSuite = { ...prev, testCases: updatedCases };
          const updatedPresets = goldenSets.map(g => g.id === prev.id ? updatedSuite : g);
          setGoldenSets(updatedPresets);
          localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updatedPresets));
          return updatedSuite;
        }
        return { ...prev, testCases: updatedCases };
      });
      setSelectedGoldenCases(prev => [...prev, newCase.id]);
      alert("프롬프트 테스트 케이스로 추가되었습니다.");
    } else {
      const targetPreset = goldenSets.find(g => g.id === scenarioId);
      if (targetPreset) {
        const updatedCases = [...(targetPreset.testCases || []), newCase];
        const updatedSuite = { ...targetPreset, testCases: updatedCases };
        const updatedPresets = goldenSets.map(g => g.id === scenarioId ? updatedSuite : g);
        setGoldenSets(updatedPresets);
        localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updatedPresets));
        alert(`"${targetPreset.name}" 시나리오에 프롬프트 테스트 케이스가 추가되었습니다.`);
      }
    }
    setAddToGoldenCase(null);
  };

  const handleManualAddCase = () => {
    if (!manualNewCaseInput.trim()) return;

    const newCase = {
      id: crypto.randomUUID(),
      category: manualNewCaseCategory,
      userInput: manualNewCaseInput.trim(),
      description: manualNewCaseDesc.trim() || '수동으로 추가됨'
    };

    setActiveGoldenSet(prev => {
      const updatedCases = [...prev.testCases, newCase];
      const updatedSuite = { ...prev, testCases: updatedCases };
      if (prev.id !== 'default') {
        setGoldenSets(prevSets => {
          const updated = prevSets.map(g => g.id === prev.id ? updatedSuite : g);
          localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updated));
          return updated;
        });
      }
      return updatedSuite;
    });

    // Check it by default in both checklists
    setSelectedManualCases(prev => [...prev, newCase.id]);
    setSelectedGoldenCases(prev => [...prev, newCase.id]);

    // Reset inputs
    setManualNewCaseInput('');
    setManualNewCaseDesc('');
  };

  const handleBulkCaseTablePaste = (event, targetId) => {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText.includes('\n') && !pastedText.includes('\t')) return;
    event.preventDefault();

    const rows = pastedText.split(/\r?\n/).filter(row => row.trim()).map(row => row.split('\t').map(cell => cell.trim()));
    const header = rows[0]?.map(cell => cell.toLowerCase().replace(/\s/g, '')) || [];
    const findColumn = (terms) => header.findIndex(cell => terms.some(term => cell.includes(term)));
    const categoryColumn = findColumn(['분류', 'category']);
    const inputColumn = findColumn(['학생발화', '사용자발화', 'userinput', 'input', '발화']);
    const descriptionColumn = findColumn(['설명', '메모', 'description', 'note']);
    const hasHeader = categoryColumn >= 0 || inputColumn >= 0 || descriptionColumn >= 0;
    const cases = rows.slice(hasHeader ? 1 : 0).map((row, index) => ({
      id: index === 0 ? targetId : crypto.randomUUID(),
      category: normalizeTestCaseCategory((categoryColumn >= 0 ? row[categoryColumn] : row.length > 1 ? row[0] : '정상 케이스')),
      userInput: (inputColumn >= 0 ? row[inputColumn] : row.length > 1 ? row[1] : row[0]) || '',
      description: (descriptionColumn >= 0 ? row[descriptionColumn] : row[2]) || ''
    })).filter(testCase => testCase.userInput);

    if (cases.length === 0) return;
    setBulkCasePreview(prev => {
      const targetIndex = prev.findIndex(testCase => testCase.id === targetId);
      const insertAt = targetIndex >= 0 ? targetIndex : prev.length;
      return [...prev.slice(0, insertAt), ...cases, ...prev.slice(insertAt + 1)];
    });
  };

  const handleConfirmBulkGoldenCases = () => {
    if (bulkCasePreview.length === 0) return;
    const casesToAdd = bulkCasePreview.filter(testCase => testCase.userInput.trim());
    if (casesToAdd.length === 0) {
      alert('학생 발화가 있는 케이스를 하나 이상 남겨 주세요.');
      return;
    }

    setActiveGoldenSet(prev => {
      const updatedSuite = { ...prev, testCases: [...prev.testCases, ...casesToAdd] };
      if (prev.id !== 'default') {
        setGoldenSets(prevSets => {
          const updated = prevSets.map(g => g.id === prev.id ? updatedSuite : g);
          localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updated));
          return updated;
        });
      }
      return updatedSuite;
    });
    setSelectedManualCases(prev => [...prev, ...casesToAdd.map(testCase => testCase.id)]);
    setSelectedGoldenCases(prev => [...prev, ...casesToAdd.map(testCase => testCase.id)]);
    setBulkCasePreview(createBulkCaseRows());
  };

  const handleSystemPromptChange = (newPrompt) => {
    setPrompt(newPrompt);
    setActiveGoldenSet(prev => ({ ...prev, systemPrompt: newPrompt }));
  };

  const handleQuickSaveScenario = () => {
    if (activeGoldenSet.id === 'default') {
      const name = window.prompt("새 프롬프트 시나리오 이름을 입력하세요:");
      if (!name || !name.trim()) return;
      const id = crypto.randomUUID();
      const suiteToSave = {
        ...activeGoldenSet,
        id,
        name: name.trim(),
        systemPrompt: prompt // Make sure we use the current prompt state
      };
      const updated = [...goldenSets, suiteToSave];
      setGoldenSets(updated);
      localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updated));
      setActiveGoldenSet(suiteToSave);
      setGoldenSetPresetName(suiteToSave.name);
      alert(`"${name}" 시나리오가 저장되었습니다.`);
    } else {
      const suiteToSave = {
        ...activeGoldenSet,
        systemPrompt: prompt // Make sure we use the current prompt state
      };
      const updated = goldenSets.map(g => g.id === activeGoldenSet.id ? suiteToSave : g);
      setGoldenSets(updated);
      localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updated));
      setActiveGoldenSet(suiteToSave);
      alert(`"${activeGoldenSet.name}" 시나리오의 변경사항이 저장되었습니다.`);
    }
  };

  // ==========================================================================
  // Prompt Improvement Workflow ('auto' tab) — helpers & handlers
  // Baseline: run current prompt against selected golden cases and score it.
  // Candidate: ask Gemini to propose a revised prompt from the baseline's
  // failure evidence, then re-run/re-score the same cases with it.
  // Nothing here mutates `prompt` / `activeGoldenSet` until the user
  // explicitly adopts a candidate via handleAdoptOptimizationCandidate.
  // ==========================================================================

  // Selected golden cases if any are checked, otherwise the whole scenario's test set.
  // Always runs the full test case set of whichever scenario this tab has independently
  // selected (optimizationActiveScenario) — this tab has no partial case-selection UI of
  // its own, by design, so it never reads the golden-set tab's selectedGoldenCases.
  const getOptimizationCases = () => {
    return optimizationActiveScenario.testCases || [];
  };

  const resolveOptimizationPrompt = (systemPromptToResolve) => {
    return (systemPromptToResolve || '').replace(/{{\s*([^}]+?)\s*}}/g, (match, key) => {
      return promptVariables[key.trim()] || '';
    });
  };

  const getModelRunOptions = (modelId) => {
    const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId);
    const modelConfig = modelConfigs[modelId] || {};
    const runOptions = {};
    if (modelInfo) {
      if (modelInfo.supportsTemperature !== false) {
        runOptions.temperature = modelConfig.temperature !== undefined ? modelConfig.temperature : 0.7;
      }
      if (modelInfo.supportsReasoningEffort && modelConfig.reasoningEffort && modelConfig.reasoningEffort !== 'none') {
        runOptions.reasoningEffort = modelConfig.reasoningEffort;
      }
      if (modelInfo.supportsVerbosity && modelConfig.verbosity && modelConfig.verbosity !== 'none') {
        runOptions.verbosity = modelConfig.verbosity;
      }
      if (modelInfo.provider === 'Google') {
        runOptions.geminiThinkingLevel = modelConfig.thinkingLevel;
      }
    }
    return runOptions;
  };

  // Runs `cases x models` against `systemPromptRaw` (variables resolved), evaluating each
  // response with the existing judge (evaluateAIResponse). Used for both baseline and candidate.
  const runOptimizationEvaluation = async (systemPromptRaw, label, cases, models, onProgress) => {
    const finalPrompt = resolveOptimizationPrompt(systemPromptRaw);
    const results = [];
    const totalRuns = cases.length * models.length;
    let runCount = 0;

    for (let i = 0; i < cases.length; i++) {
      if (abortRef.current) break;
      const testCase = cases[i];

      for (const modelId of models) {
        if (abortRef.current) break;
        runCount++;
        const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId);
        const modelName = modelInfo ? modelInfo.name : modelId;

        if (onProgress) {
          onProgress({
            current: runCount,
            total: totalRuns,
            percentage: Math.round((runCount / totalRuns) * 100),
            statusText: `[${label}] [케이스 ${i + 1}/${cases.length}] ${modelName} 호출 중...`
          });
        }

        try {
          const runOptions = getModelRunOptions(modelId);
          const response = await fetchAICompletion(modelId, [{ role: 'user', content: testCase.userInput }], finalPrompt, runOptions);

          let evalData = null;
          if (response && response.text && !response.text.includes("Error")) {
            evalData = await evaluateAIResponse(response.text, testCase.userInput, finalPrompt);
          }

          results.push({
            id: crypto.randomUUID(),
            caseId: testCase.id,
            category: testCase.category,
            userInput: testCase.userInput,
            modelId: modelId,
            modelName: modelName,
            aiOutput: response ? response.text : 'Error fetching response',
            ruleScore: evalData?.scores?.coherence !== undefined ? evalData.scores.coherence : (evalData?.scores?.rule || 0),
            relevanceScore: evalData?.scores?.relevance || 0,
            safetyScore: evalData?.scores?.safety || 0,
            totalScore: evalData?.total_avg || 0,
            judgeFeedback: evalData?.reason || '채점 실패',
            isError: !response || response.text.includes("Error")
          });
        } catch (error) {
          console.error(`Optimization run error (${label}) for model ${modelId}:`, error);
          results.push({
            id: crypto.randomUUID(),
            caseId: testCase.id,
            category: testCase.category,
            userInput: testCase.userInput,
            modelId: modelId,
            modelName: modelName,
            aiOutput: error.message || 'Error occurred during generation',
            ruleScore: 0,
            relevanceScore: 0,
            safetyScore: 0,
            totalScore: 0,
            judgeFeedback: '에러 발생',
            isError: true
          });
        }
      }
    }

    return results;
  };

  // Aggregates a result list into overall + per-model averages, and pulls out the
  // weakest cases/errors so they can be shown in the UI and fed to the improvement agent.
  // Errored evaluations are excluded from every average.
  const summarizeOptimizationResults = (results) => {
    const validResults = results.filter(r => !r.isError);
    const count = validResults.length;

    const avg = (key) => count > 0
      ? parseFloat((validResults.reduce((acc, r) => acc + (r[key] || 0), 0) / count).toFixed(2))
      : 0;

    const overall = {
      count,
      errorCount: results.length - count,
      totalScore: avg('totalScore'),
      coherence: avg('ruleScore'),
      relevance: avg('relevanceScore'),
      safety: avg('safetyScore')
    };

    const perModelAcc = {};
    validResults.forEach(r => {
      if (!perModelAcc[r.modelName]) {
        perModelAcc[r.modelName] = { count: 0, totalScore: 0, coherence: 0, relevance: 0, safety: 0 };
      }
      const acc = perModelAcc[r.modelName];
      acc.count += 1;
      acc.totalScore += r.totalScore;
      acc.coherence += r.ruleScore;
      acc.relevance += r.relevanceScore;
      acc.safety += r.safetyScore;
    });

    const perModel = Object.fromEntries(Object.entries(perModelAcc).map(([name, acc]) => [
      name,
      {
        count: acc.count,
        totalScore: parseFloat((acc.totalScore / acc.count).toFixed(2)),
        coherence: parseFloat((acc.coherence / acc.count).toFixed(2)),
        relevance: parseFloat((acc.relevance / acc.count).toFixed(2)),
        safety: parseFloat((acc.safety / acc.count).toFixed(2))
      }
    ]));

    const lowScoreCases = validResults
      .filter(r => r.totalScore < 7)
      .sort((a, b) => a.totalScore - b.totalScore)
      .slice(0, 8);

    const errorCases = results.filter(r => r.isError);

    return { overall, perModel, lowScoreCases, errorCases };
  };

  // Turns a summarizeOptimizationResults() output into the plain-text evidence
  // that gets handed to the Gemini improvement agent as `evaluationSummary`.
  const buildOptimizationEvaluationSummaryText = (summary) => {
    const { overall, perModel, lowScoreCases, errorCases } = summary;
    const lines = [];
    lines.push(`전체 평균: Total ${overall.totalScore} / Coherence ${overall.coherence} / Relevance ${overall.relevance} / Safety ${overall.safety} (평가 ${overall.count}건, 오류 ${overall.errorCount}건)`);
    Object.entries(perModel).forEach(([name, m]) => {
      lines.push(`- ${name}: Total ${m.totalScore} / Coherence ${m.coherence} / Relevance ${m.relevance} / Safety ${m.safety} (${m.count}건)`);
    });
    if (lowScoreCases.length > 0) {
      lines.push('낮은 점수 사례 (개선이 필요한 지점):');
      lowScoreCases.forEach(c => {
        lines.push(`- [${c.category}] "${c.userInput}" (${c.modelName}) → Total ${c.totalScore} (Coherence ${c.ruleScore} / Relevance ${c.relevanceScore} / Safety ${c.safetyScore}) | 채점 근거: ${c.judgeFeedback}`);
      });
    }
    if (errorCases.length > 0) {
      lines.push(`API/평가 오류로 제외된 사례: ${errorCases.length}건`);
    }
    return lines.join('\n');
  };

  const handleStopOptimization = () => {
    abortRef.current = true;
    setOptimizationIsRunning(false);
  };

  // "기준 테스트 실행": scores the *current* prompt against the selected cases/models.
  const handleRunOptimizationBaseline = async () => {
    if (selectedModels.length === 0) {
      alert("평가할 모델을 하나 이상 선택해 주세요.");
      return null;
    }
    const cases = getOptimizationCases();
    if (cases.length === 0) {
      alert("평가할 테스트 케이스가 없습니다. 골든셋에서 테스트 케이스를 추가해 주세요.");
      return null;
    }
    if (!optimizationPromptText.trim()) {
      alert("시스템 프롬프트를 입력해 주세요.");
      return null;
    }

    setOptimizationError('');
    setOptimizationIsRunning(true);
    abortRef.current = false;
    setOptimizationProgress({ current: 0, total: cases.length * selectedModels.length, percentage: 0, statusText: '기준 테스트 실행 중...' });

    try {
      const results = await runOptimizationEvaluation(optimizationPromptText, '기준', cases, selectedModels, setOptimizationProgress);
      const summary = summarizeOptimizationResults(results);
      const baseline = {
        systemPrompt: optimizationPromptText,
        variables: { ...promptVariables },
        cases,
        models: [...selectedModels],
        results,
        summary,
        createdAt: Date.now()
      };
      setOptimizationBaseline(baseline);
      setOptimizationCandidate(null);
      setOptimizationCandidatePrompt('');
      setOptimizationProgress(prev => ({ ...prev, statusText: abortRef.current ? '기준 테스트가 중단되었습니다.' : '기준 테스트 완료' }));
      if (!abortRef.current) {
        setOptimizationStep('results');
      }
      return baseline;
    } catch (error) {
      console.error('기준 테스트 실행 오류:', error);
      setOptimizationError(error.message || '기준 테스트 실행 중 오류가 발생했습니다.');
      return null;
    } finally {
      setOptimizationIsRunning(false);
    }
  };

  // "자동 개선 및 재검증": ensures a fresh baseline exists, asks Gemini for a revised
  // prompt from the baseline's failure evidence, then re-runs/re-scores that candidate
  // against the exact same cases/models/variables so the comparison is apples-to-apples.
  const handleRunOptimizationCycle = async () => {
    if (selectedModels.length === 0) {
      alert("평가할 모델을 하나 이상 선택해 주세요.");
      return;
    }
    const cases = getOptimizationCases();
    if (cases.length === 0) {
      alert("평가할 테스트 케이스가 없습니다. 골든셋에서 테스트 케이스를 추가해 주세요.");
      return;
    }

    setOptimizationError('');

    let baseline = optimizationBaseline;
    if (!baseline || baseline.systemPrompt !== optimizationPromptText) {
      baseline = await handleRunOptimizationBaseline();
      if (!baseline) return;
    }

    if (abortRef.current) return;

    setOptimizationIsRunning(true);
    setOptimizationProgress({ current: 0, total: 1, percentage: 0, statusText: 'Gemini 개선 에이전트 호출 중...' });

    try {
      const evaluationSummary = buildOptimizationEvaluationSummaryText(baseline.summary);
      const improvement = await generatePromptImprovement({
        systemPrompt: baseline.systemPrompt,
        variables: baseline.variables,
        testCases: baseline.cases,
        evaluationSummary
      });

      if (abortRef.current) {
        setOptimizationProgress(prev => ({ ...prev, statusText: '재검증이 중단되었습니다.' }));
        return;
      }

      setOptimizationCandidatePrompt(improvement.proposedPrompt);
      setOptimizationProgress({ current: 0, total: baseline.cases.length * baseline.models.length, percentage: 0, statusText: '개선안 재검증 실행 중...' });

      const results = await runOptimizationEvaluation(improvement.proposedPrompt, '개선안', baseline.cases, baseline.models, setOptimizationProgress);
      const summary = summarizeOptimizationResults(results);

      setOptimizationCandidate({
        systemPrompt: improvement.proposedPrompt,
        summaryText: improvement.summary || '',
        changes: Array.isArray(improvement.changes) ? improvement.changes : [],
        risks: Array.isArray(improvement.risks) ? improvement.risks : [],
        results,
        summary,
        createdAt: Date.now()
      });
      setOptimizationProgress(prev => ({ ...prev, statusText: abortRef.current ? '재검증이 중단되었습니다.' : '개선안 재검증 완료' }));
      if (!abortRef.current) {
        setOptimizationStep('compare');
      }
    } catch (error) {
      console.error('프롬프트 개선 사이클 오류:', error);
      setOptimizationError(error.message || '프롬프트 개선 및 재검증 중 오류가 발생했습니다.');
    } finally {
      setOptimizationIsRunning(false);
    }
  };

  // "개선안 채택": applies the (possibly user-edited) candidate prompt to this tab's own
  // prompt text, and — only if the scenario currently selected here is a saved one —
  // writes the new systemPrompt back into that saved preset (goldenSets/localStorage) so
  // it's durable. It does NOT touch the global `prompt`/`activeGoldenSet` used by the
  // golden-set or manual-test tabs, since scenario selection is independent per tab now.
  const handleAdoptOptimizationCandidate = () => {
    const finalPrompt = optimizationCandidatePrompt.trim();
    if (!finalPrompt) {
      alert("채택할 개선 프롬프트 내용이 없습니다.");
      return;
    }

    setOptimizationPromptText(finalPrompt);

    if (optimizationActiveScenario.id !== 'default') {
      setGoldenSets(prevSets => {
        const updatedSets = prevSets.map(g => g.id === optimizationActiveScenario.id ? { ...g, systemPrompt: finalPrompt } : g);
        localStorage.setItem('ai-prompt-golden-sets', JSON.stringify(updatedSets));
        return updatedSets;
      });
    }

    const versionEntry = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      scenarioId: optimizationActiveScenario.id,
      scenarioName: optimizationActiveScenario.id === 'default' ? '(임시) 새 프롬프트 시나리오' : optimizationActiveScenario.name,
      prompt: finalPrompt,
      baselineScore: optimizationBaseline?.summary?.overall || null,
      candidateScore: optimizationCandidate?.summary?.overall || null,
      changes: optimizationCandidate?.changes || []
    };

    setOptimizationVersions(prev => {
      const updated = [versionEntry, ...prev].slice(0, 20);
      localStorage.setItem('ai-prompt-improvement-versions', JSON.stringify(updated));
      return updated;
    });

    alert("개선안이 '프롬프트 개선' 탭의 현재 프롬프트에 적용되었습니다." + (optimizationActiveScenario.id !== 'default' ? ` 저장된 시나리오("${optimizationActiveScenario.name}")에도 반영되었습니다.` : ''));
  };

  const handleManualScenarioChange = (scenarioId) => {
    setManualScenarioId(scenarioId);
    setSelectedMultiPresetIds([]);
    setActiveSinglePresetResultId('');
    setManualResults([]);
    if (scenarioId === 'default') {
      setManualPrompt('');
      setSelectedManualCases([]);
      return;
    }
    const preset = goldenSets.find(g => g.id === scenarioId);
    setManualPrompt(preset?.systemPrompt || '');
    setSelectedManualCases((preset?.testCases || []).map(c => c.id));
  };

  const renderPromptScenarioSelector = () => {
    return (
      <div className="scenario-selector-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
          <span style={{ fontSize: '1.1rem', cursor: 'default' }} title="프롬프트 시나리오">📂</span>
          <select
            value={activeGoldenSet.id}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'default') {
                setActiveGoldenSet({
                  id: 'default',
                  name: '새 프롬프트 시나리오',
                  title: '',
                  memo: '',
                  context: '',
                  systemPrompt: '',
                  testCases: []
                });
                setPrompt('');
                setGoldenSetPresetName('');
                setSelectedGoldenCases([]);
                setSelectedManualCases([]);
                setGoldenSetResults([]);
              } else {
                const preset = goldenSets.find(g => g.id === val);
                if (preset) {
                  handleLoadGoldenPreset(preset);
                }
              }
            }}
            style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', flex: 1, backgroundColor: '#111419', border: '1px solid var(--surface-border)', color: '#fff' }}
          >
            <option value="default">-- 직접 입력 / 새 프롬프트 시나리오 --</option>
            {goldenSets.map(g => (
              <option key={g.id} value={g.id}>
                {g.title || '(제목 없음)'} - {g.name} ({g.testCases?.length || 0} cases)
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn-primary"
          onClick={handleQuickSaveScenario}
          title="현재 프롬프트 시나리오 및 케이스 저장"
          style={{ padding: '8px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', background: activeGoldenSet.id === 'default' ? 'var(--primary-color)' : 'var(--success)' }}
        >
          💾 {activeGoldenSet.id === 'default' ? '새로 저장' : '저장'}
        </button>
      </div>
    );
  };

  const handleRunGoldenSet = async () => {
    const selectedCases = activeGoldenSet.testCases.filter(c => selectedGoldenCases.includes(c.id));
    if (selectedModels.length === 0) {
      alert("평가할 모델을 하나 이상 선택해 주세요.");
      return;
    }
    if (selectedCases.length === 0) {
      alert("평가할 테스트 케이스를 하나 이상 선택해 주세요.");
      return;
    }

    setGoldenSetIsRunning(true);
    abortRef.current = false;
    setGoldenSetResults([]);

    const totalRuns = selectedCases.length * selectedModels.length;
    let runCount = 0;
    let completedResults = [];

    for (let i = 0; i < selectedCases.length; i++) {
      if (abortRef.current) break;
      const testCase = selectedCases[i];
      
      const finalPrompt = activeGoldenSet.systemPrompt.replace(/{{\s*([^}]+?)\s*}}/g, (match, key) => {
        return promptVariables[key.trim()] || '';
      });

      for (const modelId of selectedModels) {
        if (abortRef.current) break;
        runCount++;

        const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId);
        const modelName = modelInfo ? modelInfo.name : modelId;

        setGoldenSetProgress({
          current: runCount,
          total: totalRuns,
          percentage: Math.round((runCount / totalRuns) * 100),
          statusText: `[케이스 ${i + 1}/${selectedCases.length}] ${modelName} 호출 중...`
        });

        try {
          const modelConfig = modelConfigs[modelId] || {};
          const runOptions = {};
          
          if (modelInfo) {
             if (modelInfo.supportsTemperature !== false) {
               runOptions.temperature = modelConfig.temperature !== undefined ? modelConfig.temperature : 0.7;
             }
             if (modelInfo.supportsReasoningEffort && modelConfig.reasoningEffort && modelConfig.reasoningEffort !== 'none') {
               runOptions.reasoningEffort = modelConfig.reasoningEffort;
             }
             if (modelInfo.supportsVerbosity && modelConfig.verbosity && modelConfig.verbosity !== 'none') {
               runOptions.verbosity = modelConfig.verbosity;
             }
             if (modelInfo.provider === 'Google') {
               runOptions.geminiThinkingLevel = modelConfig.thinkingLevel;
             }
          }

          const start = Date.now();
          const response = await fetchAICompletion(modelId, [{ role: 'user', content: testCase.userInput }], finalPrompt, runOptions);
          const end = Date.now();
          const responseTimeMs = end - start;

          setGoldenSetProgress(prev => ({
            ...prev,
            statusText: `[케이스 ${i + 1}/${selectedCases.length}] 결과 AI 채점 중...`
          }));

          let evalData = null;
          if (response && response.text && !response.text.includes("Error")) {
            evalData = await evaluateAIResponse(response.text, testCase.userInput, finalPrompt);
          }

          let thinkingValue = 'none';
          if (modelInfo) {
            if (modelInfo.provider === 'OpenAI') {
              const effort = modelConfig.reasoningEffort || 'none';
              const verbosity = modelConfig.verbosity || 'none';
              thinkingValue = `Reasoning ${effort} / Verbosity ${verbosity}`;
            } else if (modelInfo.provider === 'Google') {
              thinkingValue = modelConfig.thinkingLevel || 'none';
            }
          }

          const resultItem = {
            id: crypto.randomUUID(),
            caseId: testCase.id,
            category: testCase.category,
            userInput: testCase.userInput,
            modelId: modelId,
            modelName: modelName,
            thinkingLevel: thinkingValue,
            aiOutput: response ? response.text : 'Error fetching response',
            responseTimeMs: responseTimeMs,
            ruleScore: evalData?.scores?.coherence !== undefined ? evalData.scores.coherence : (evalData?.scores?.rule || 0),
            relevanceScore: evalData?.scores?.relevance || 0,
            safetyScore: evalData?.scores?.safety || 0,
            totalScore: evalData?.total_avg || 0,
            scores_breakdown: evalData?.scores ? {
              coherence_breakdown: evalData.scores.coherence_breakdown,
              relevance_breakdown: evalData.scores.relevance_breakdown,
              safety_breakdown: evalData.scores.safety_breakdown
            } : null,
            judgeFeedback: evalData?.reason || '채점 실패',
            isError: !response || response.text.includes("Error")
          };

          completedResults.push(resultItem);
          setGoldenSetResults([...completedResults]);

        } catch (error) {
          console.error(`Error processing golden case with model ${modelId}:`, error);
          const errorResult = {
            id: crypto.randomUUID(),
            caseId: testCase.id,
            category: testCase.category,
            userInput: testCase.userInput,
            modelId: modelId,
            modelName: modelName,
            thinkingLevel: '-',
            aiOutput: error.message || 'Error occurred during generation',
            responseTimeMs: 0,
            ruleScore: 0,
            relevanceScore: 0,
            safetyScore: 0,
            totalScore: 0,
            scores_breakdown: null,
            judgeFeedback: '에러 발생',
            isError: true
          };
          completedResults.push(errorResult);
          setGoldenSetResults([...completedResults]);
        }
      }
    }

    setGoldenSetIsRunning(false);
    if (!abortRef.current) {
      setGoldenSetProgress(prev => ({
        ...prev,
        statusText: `프롬프트 테스트 평가 완료! 총 ${selectedCases.length}개 케이스 평가가 완료되었습니다.`
      }));
    }
  };

  const handleExportGoldenResultsExcel = () => {
    if (goldenSetResults.length === 0) {
      alert("내보낼 평가 결과가 없습니다.");
      return;
    }

    const sortedResults = [...goldenSetResults].sort((a, b) => {
      const idxA = AVAILABLE_MODELS.findIndex(m => m.name === a.modelName || m.id === a.modelId);
      const idxB = AVAILABLE_MODELS.findIndex(m => m.name === b.modelName || m.id === b.modelId);
      if (idxA !== idxB) return idxA - idxB;
      return a.category.localeCompare(b.category);
    });

    const dataToExport = sortedResults.map(item => ({
      '케이스 유형': item.category,
      'User Input': item.userInput,
      'Model Name': item.modelName,
      '사고 레벨': item.thinkingLevel || '-',
      'AI Output': item.aiOutput,
      'Coherence (일관성)': item.ruleScore,
      'Relevance (관련성)': item.relevanceScore,
      'Constraints & Safety (제약 사항 및 안전성)': item.safetyScore,
      'Average Score (평균)': item.totalScore,
      'Judge Feedback (평가 피드백)': item.judgeFeedback,
      '응답 속도 (초)': (item.responseTimeMs / 1000).toFixed(2)
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Prompt Test Results");
    XLSX.writeFile(workbook, `Prompt_Test_Evaluation_${new Date().getTime()}.xlsx`);
  };

  const getGoldenModelAverages = () => {
    const averages = {};
    goldenSetResults.forEach(item => {
      if (!averages[item.modelName]) {
        averages[item.modelName] = { 
          total: 0, count: 0, 
          rule: 0, relevance: 0, safety: 0,
          categories: {}
        };
      }
      
      if (!averages[item.modelName].categories[item.category]) {
        averages[item.modelName].categories[item.category] = { total: 0, count: 0 };
      }

      if (item.totalScore > 0 && !item.isError) {
        averages[item.modelName].total += item.totalScore;
        averages[item.modelName].rule += item.ruleScore;
        averages[item.modelName].relevance += item.relevanceScore;
        averages[item.modelName].safety += item.safetyScore;
        averages[item.modelName].count += 1;

        averages[item.modelName].categories[item.category].total += item.totalScore;
        averages[item.modelName].categories[item.category].count += 1;
      }
    });

    return Object.fromEntries(
      Object.entries(averages).map(([modelName, val]) => [
        modelName,
        val.count > 0 ? {
          total: (val.total / val.count).toFixed(2),
          rule: (val.rule / val.count).toFixed(2),
          relevance: (val.relevance / val.count).toFixed(2),
          safety: (val.safety / val.count).toFixed(2),
          count: val.count,
          categories: Object.fromEntries(
            Object.entries(val.categories).map(([cat, cval]) => [
              cat,
              cval.count > 0 ? (cval.total / cval.count).toFixed(2) : '0.00'
            ])
          )
        } : null
      ]).filter(entry => entry[1] !== null)
    );
  };

  const goldenModelAverages = getGoldenModelAverages();

  const getMaxHistoryLength = () => {
    let maxLen = 0;
    selectedModels.forEach(modelId => {
      const historyLen = results[modelId]?.history?.length || 0;
      const isLoading = results[modelId]?.loading;
      const virtualLen = historyLen + (isLoading ? 1 : 0);
      if (virtualLen > maxLen) {
        maxLen = virtualLen;
      }
    });
    return maxLen;
  };

  // Small +/- indicator used across the optimization comparison cards/version list.
  const renderOptimizationScoreDelta = (baseVal, candVal) => {
    if (baseVal === undefined || baseVal === null || candVal === undefined || candVal === null) return null;
    const diff = parseFloat((candVal - baseVal).toFixed(2));
    if (diff === 0) return <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem' }}>(±0)</span>;
    const color = diff > 0 ? '#4ade80' : '#f87171';
    const sign = diff > 0 ? '+' : '';
    return <span style={{ color, fontWeight: 600, fontSize: '0.8rem' }}>({sign}{diff})</span>;
  };

  const renderOptimizationScenarioSelector = () => (
    <div className="scenario-selector-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
        <span style={{ fontSize: '1.1rem', cursor: 'default' }} title="프롬프트 시나리오">📂</span>
        <select
          value={optimizationScenarioId}
          onChange={(e) => {
            const val = e.target.value;
            setOptimizationScenarioId(val);
            setOptimizationBaseline(null);
            setOptimizationCandidate(null);
            setOptimizationCandidatePrompt('');
            setOptimizationError('');
            setOptimizationStep('setting');
            if (val === 'default') {
              setOptimizationPromptText('');
            } else {
              const preset = goldenSets.find(g => g.id === val);
              setOptimizationPromptText(preset?.systemPrompt || '');
            }
          }}
          style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', flex: 1, backgroundColor: '#111419', border: '1px solid var(--surface-border)', color: '#fff' }}
        >
          <option value="default">-- 직접 입력 / 새 프롬프트 시나리오 --</option>
          {goldenSets.map(g => (
            <option key={g.id} value={g.id}>
              {g.title || '(제목 없음)'} - {g.name} ({g.testCases?.length || 0} cases)
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  // Step nav bar for the wizard — every step stays clickable at any time (per request:
  // "각 단계별로 다시 확인해볼 수 있는 구조"), it's not a gated one-way flow.
  const renderOptimizationStepNav = () => (
    <div className="glass-panel" style={{ display: 'flex', alignItems: 'flex-start', gap: '2px', padding: '14px 20px', marginBottom: '20px', flexWrap: 'wrap' }}>
      {OPTIMIZATION_STEPS.map((step, idx) => (
        <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start' }}>
          <button
            onClick={() => setOptimizationStep(step.key)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 10px',
              textAlign: 'left',
              color: optimizationStep === step.key ? 'var(--text-main)' : 'var(--text-muted)'
            }}
          >
            <div style={{ fontSize: '0.9rem', fontWeight: optimizationStep === step.key ? 700 : 500 }}>
              {idx + 1}. {step.title}
            </div>
            <div style={{ fontSize: '0.7rem', marginTop: '2px' }}>{step.subtitle}</div>
          </button>
          {idx < OPTIMIZATION_STEPS.length - 1 && (
            <span style={{ color: 'var(--text-muted)', margin: '4px 4px 0' }}>›</span>
          )}
        </div>
      ))}
    </div>
  );

  const renderOptimizationEmptyStep = (message, ctaLabel, ctaStep) => (
    <div className="results-area glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <p style={{ fontSize: '0.9rem', marginBottom: ctaLabel ? '16px' : 0 }}>{message}</p>
      {ctaLabel && (
        <button className="btn-primary" onClick={() => setOptimizationStep(ctaStep)}>
          {ctaLabel}
        </button>
      )}
    </div>
  );

  // Detailed per-case × per-model result rows, used for both the baseline list (step 2)
  // and the paired before/after comparison (step 3) — this is the "실제로 뭐가 나왔는지"
  // detail that was missing before, so results are actually verifiable.
  const renderOptimizationResultRow = (r) => (
    <tr key={r.id} style={{ opacity: r.isError ? 0.7 : 1 }}>
      <td>
        <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
          {r.category}
        </span>
      </td>
      <td style={{ fontWeight: 'bold' }}>{r.modelName}</td>
      <td>
        <pre style={{ fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-wrap' }}>{r.userInput}</pre>
      </td>
      <td>
        <pre style={{ fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-wrap' }}>{r.aiOutput}</pre>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary)' }}>{r.totalScore}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>avg</span>
        </div>
      </td>
      <td>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <strong>Coherence:</strong> {r.ruleScore} | <strong>Relevance:</strong> {r.relevanceScore} | <strong>Safety:</strong> {r.safetyScore}
          <br />
          {r.judgeFeedback}
        </div>
      </td>
    </tr>
  );

  const renderOptimizationResultsTable = (results) => (
    <div className="batch-table-container">
      <table className="batch-table">
        <thead>
          <tr>
            <th style={{ width: '110px' }}>Category</th>
            <th style={{ width: '130px' }}>Model</th>
            <th style={{ width: '220px' }}>User Input</th>
            <th style={{ width: '280px' }}>AI Output</th>
            <th style={{ width: '100px' }}>Scores</th>
            <th>Judge Feedback</th>
          </tr>
        </thead>
        <tbody>
          {results.map(r => renderOptimizationResultRow(r))}
        </tbody>
      </table>
    </div>
  );

  // ---- Step 1: 세팅 ----
  const renderOptimizationSettingStep = () => {
    const optimizationCases = getOptimizationCases();
    const promptStale = !!(optimizationBaseline && optimizationBaseline.systemPrompt !== optimizationPromptText);
    const progressPct = optimizationProgress.total > 0
      ? (optimizationProgress.percentage || Math.round((optimizationProgress.current / optimizationProgress.total) * 100))
      : 0;

    return (
      <div className="top-panel">
        <div className="input-panel glass-panel">
          <h2 style={{ marginTop: 0 }}>1. 세팅</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
            골든셋 시나리오와 시스템 프롬프트, 평가 모델을 선택한 뒤 기준 테스트를 실행합니다.
          </p>

          {renderOptimizationScenarioSelector()}

          <div className="input-section" style={{ marginTop: '12px' }}>
            <label htmlFor="optimization-prompt">현재 시스템 프롬프트</label>
            <textarea
              id="optimization-prompt"
              rows={8}
              placeholder="프롬프트 테스트를 수행할 시스템 프롬프트를 입력하거나 위에서 시나리오를 선택하세요."
              value={optimizationPromptText}
              onChange={(e) => setOptimizationPromptText(e.target.value)}
              style={{ fontSize: '0.85rem', lineHeight: '1.4', backgroundColor: '#111419' }}
            />
          </div>

          {uniqueOptimizationVariables.length > 0 && (
            <div className="input-section" style={{ marginTop: '12px' }}>
              <label>변수 값 ({"{{변수명}}"})</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {uniqueOptimizationVariables.map(key => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '110px', flexShrink: 0, fontSize: '0.8rem' }} title={key}>{key}</span>
                    <input
                      type="text"
                      value={promptVariables[key] || ''}
                      onChange={(e) => handleVariableChange(key, e.target.value)}
                      placeholder={`Value for ${key}`}
                      style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem', height: '32px', backgroundColor: '#111419' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="input-section" style={{ marginTop: '12px' }}>
            <label>Select Models</label>
            <div className="models-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {AVAILABLE_MODELS.map((model) => {
                const isSelected = selectedModels.includes(model.id);
                return (
                  <div key={model.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label className={`model-checkbox-label ${isSelected ? 'selected' : ''}`} style={{ margin: 0 }}>
                      <input type="checkbox" checked={isSelected} onChange={() => handleToggleModel(model.id)} />
                      <span>{model.name}</span>
                    </label>
                    <ModelConfigOptions model={model} config={isSelected ? modelConfigs[model.id] : null} onChange={(key, value) => setModelConfigs(prev => ({ ...prev, [model.id]: { ...prev[model.id], [key]: value } }))} />
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            선택된 시나리오의 테스트 케이스: <strong>{optimizationCases.length}</strong>개 (전체 케이스로 실행됩니다)
          </div>

          {promptStale && optimizationBaseline && (
            <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.08)', padding: '8px 10px', borderRadius: '6px' }}>
              ⚠️ 현재 프롬프트가 기준 테스트 실행 시점과 다릅니다. "자동 개선 및 재검증"을 누르면 기준 테스트를 다시 실행합니다.
            </div>
          )}

          {optimizationError && (
            <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#f87171', background: 'rgba(248, 113, 113, 0.08)', padding: '8px 10px', borderRadius: '6px' }}>
              ⚠️ {optimizationError}
            </div>
          )}

          <div className="run-actions" style={{ marginTop: '16px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            {optimizationIsRunning ? (
              <button className="btn-primary" onClick={handleStopOptimization} style={{ backgroundColor: 'var(--error)' }}>
                ⏹ 실행 중단
              </button>
            ) : (
              <>
                <button
                  className="btn-primary"
                  onClick={handleRunOptimizationBaseline}
                  disabled={selectedModels.length === 0 || optimizationCases.length === 0 || !optimizationPromptText.trim()}
                  style={{ backgroundColor: 'var(--surface-border)' }}
                >
                  📏 기준 테스트 실행
                </button>
                <button
                  className="btn-primary"
                  onClick={handleRunOptimizationCycle}
                  disabled={selectedModels.length === 0 || optimizationCases.length === 0 || !optimizationPromptText.trim()}
                >
                  🪄 자동 개선 및 재검증
                </button>
              </>
            )}
          </div>

          {optimizationProgress.total > 0 && (
            <div className="progress-container" style={{ marginTop: '16px' }}>
              <div className="progress-header">
                <span>{optimizationProgress.statusText}</span>
                {optimizationProgress.total > 1 && (
                  <span>{optimizationProgress.current} / {optimizationProgress.total} ({progressPct}%)</span>
                )}
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${progressPct}%` }}></div>
              </div>
            </div>
          )}

          {optimizationBaseline && (
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-icon" onClick={() => setOptimizationStep('results')} style={{ fontSize: '0.8rem', padding: '6px 12px', backgroundColor: 'var(--surface)' }}>
                2. 테스트 결과 확인 →
              </button>
            </div>
          )}
        </div>

        <div className="variable-mapping-panel glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3>진행 흐름</h3>
          <ol style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.7', paddingLeft: '18px' }}>
            <li>골든셋 시나리오를 선택하거나 새 프롬프트를 입력합니다.</li>
            <li>"기준 테스트 실행"으로 현재 프롬프트의 성능을 측정하고, 2단계에서 실제 응답을 하나하나 확인합니다.</li>
            <li>"자동 개선 및 재검증"으로 Gemini가 실패 패턴을 분석해 개선안을 만들고, 같은 케이스로 다시 검증합니다. 3단계에서 기존/개선 결과물을 나란히 비교합니다.</li>
            <li>개선안을 검토하고, 필요하면 직접 수정한 뒤 "개선안 채택"으로 적용합니다.</li>
          </ol>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            ※ 개선안은 자동으로 적용되지 않습니다. 반드시 검토 후 채택해 주세요. 위 3단계는 언제든 다시 눌러 확인할 수 있습니다.
          </p>
        </div>
      </div>
    );
  };

  // ---- Step 2: 테스트 결과 확인 (해당 프롬프트 결과 목록 노출) ----
  const renderOptimizationResultsStep = () => {
    if (!optimizationBaseline) {
      return renderOptimizationEmptyStep(
        '아직 기준 테스트 결과가 없습니다. 1단계 "세팅"에서 기준 테스트를 먼저 실행해 주세요.',
        '1. 세팅으로 이동',
        'setting'
      );
    }

    const { overall, perModel } = optimizationBaseline.summary;

    return (
      <>
        <div className="dashboard-panel glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
          <h2 style={{ marginTop: 0 }}>2. 테스트 결과 확인</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            아래는 1단계에서 실행한 시스템 프롬프트로 나온 실제 응답 목록입니다. 개선을 진행하기 전에 결과를 직접 확인해 보세요.
          </p>
          <details style={{ marginBottom: '12px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)' }}>이 결과를 만든 시스템 프롬프트 보기</summary>
            <pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', background: '#111419', padding: '10px', borderRadius: '6px', marginTop: '8px' }}>{optimizationBaseline.systemPrompt}</pre>
          </details>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>전체 평균</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{overall.totalScore} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>/ 10</span></div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>평가 {overall.count}건 · 오류 {overall.errorCount}건</div>
            </div>
            {Object.entries(perModel).map(([modelName, m]) => (
              <div key={modelName} style={{ flex: '1 1 160px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{modelName}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{m.totalScore}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>C {m.coherence} · R {m.relevance} · S {m.safety}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="results-area glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ marginTop: 0 }}>기준 프롬프트 결과 목록 ({optimizationBaseline.results.length}건)</h3>
          {renderOptimizationResultsTable(optimizationBaseline.results)}
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button className="btn-icon" onClick={() => setOptimizationStep('setting')} style={{ fontSize: '0.8rem', padding: '6px 12px', backgroundColor: 'var(--surface)' }}>
            ← 1. 세팅으로
          </button>
          <button
            className="btn-primary"
            onClick={handleRunOptimizationCycle}
            disabled={optimizationIsRunning || selectedModels.length === 0}
            style={{ fontSize: '0.8rem', padding: '6px 12px' }}
          >
            🪄 이 결과로 개선안 생성하기 →
          </button>
        </div>
      </>
    );
  };

  // ---- Step 3: 프롬프트 개선안 구조 (기존 비교, 이후 구조 비교, 피드백 현황) ----
  const renderOptimizationCompareStep = () => {
    if (!optimizationCandidate) {
      return renderOptimizationEmptyStep(
        optimizationBaseline
          ? '아직 개선안이 생성되지 않았습니다. 1단계에서 "자동 개선 및 재검증"을 실행하면 이 단계에서 비교 결과를 볼 수 있습니다.'
          : '먼저 1단계에서 기준 테스트를 실행하고, 개선안을 생성해야 이 단계를 볼 수 있습니다.',
        optimizationBaseline ? '1. 세팅으로 이동' : '1. 세팅으로 이동',
        'setting'
      );
    }

    const baselineOverall = optimizationBaseline?.summary?.overall;
    const candidateOverall = optimizationCandidate.summary.overall;
    const safetyDropped = !!(baselineOverall && candidateOverall.safety < baselineOverall.safety);
    const overallImproved = !!(baselineOverall && candidateOverall.totalScore > baselineOverall.totalScore);

    const renderMetricCard = (title, baseVal, candVal) => (
      <div style={{ flex: '1 1 140px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '12px' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>기존</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{baseVal !== undefined ? baseVal : '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>개선안</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--primary)' }}>
              {candVal} {renderOptimizationScoreDelta(baseVal, candVal)}
            </div>
          </div>
        </div>
      </div>
    );

    // Pair every candidate result with its matching baseline result (same case + model)
    // so 기존/개선 출력을 나란히 비교할 수 있다.
    const pairedResults = optimizationCandidate.results.map(candResult => ({
      base: optimizationBaseline?.results?.find(r => r.caseId === candResult.caseId && r.modelId === candResult.modelId) || null,
      candidate: candResult
    }));

    const DIMENSION_DEFS = [
      { key: 'ruleScore', label: '일관성' },
      { key: 'relevanceScore', label: '관련성' },
      { key: 'safetyScore', label: '안전성' }
    ];

    // 기존 프롬프트 결과물 쪽: 점수 자체가 낮은(문제가 있었던) 항목을 빨간색으로 강조.
    const renderBaselineDimensionChip = (label, val) => {
      const weak = typeof val === 'number' && val < 6;
      return (
        <span key={label} style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', marginRight: '4px', display: 'inline-block', background: weak ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.04)', color: weak ? '#f87171' : 'var(--text-muted)' }}>
          {label} {val ?? '-'}{weak ? ' ⚠️' : ''}
        </span>
      );
    };

    // 개선 프롬프트 결과물 쪽: 기존 대비 개선/하락된 항목을 색으로 강조.
    const renderCandidateDimensionChip = (label, baseVal, candVal) => {
      const hasBase = typeof baseVal === 'number';
      const diff = hasBase ? parseFloat((candVal - baseVal).toFixed(2)) : null;
      const improved = diff !== null && diff > 0;
      const regressed = diff !== null && diff < 0;
      return (
        <span key={label} style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', marginRight: '4px', display: 'inline-block', background: improved ? 'rgba(74,222,128,0.15)' : regressed ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.04)', color: improved ? '#4ade80' : regressed ? '#f87171' : 'var(--text-muted)' }}>
          {label} {candVal ?? '-'}{diff !== null && diff !== 0 ? (improved ? ` ▲${diff}` : ` ▼${Math.abs(diff)}`) : ''}
        </span>
      );
    };

    // 케이스 헤더에 붙는 한 줄 요약: "✅ 안전성 개선 · ⚠️ 관련성 하락" 형태.
    const renderCaseImprovementBadge = (base, candidate) => {
      if (!base) return null;
      const improved = [];
      const regressed = [];
      DIMENSION_DEFS.forEach(({ key, label }) => {
        const diff = parseFloat(((candidate[key] || 0) - (base[key] || 0)).toFixed(2));
        if (diff > 0) improved.push(label);
        else if (diff < 0) regressed.push(label);
      });
      if (improved.length === 0 && regressed.length === 0) {
        return <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>변화 없음</span>;
      }
      return (
        <span style={{ fontSize: '0.72rem', display: 'inline-flex', gap: '10px' }}>
          {improved.length > 0 && <span style={{ color: '#4ade80', fontWeight: 600 }}>✅ {improved.join('·')} 개선</span>}
          {regressed.length > 0 && <span style={{ color: '#f87171', fontWeight: 600 }}>⚠️ {regressed.join('·')} 하락</span>}
        </span>
      );
    };

    const promptDiff = computeLineDiff(optimizationBaseline?.systemPrompt || '', optimizationCandidatePrompt);
    const promptHasChanges = promptDiff.some(l => l.type !== 'same');

    return (
      <>
        <div className="dashboard-panel glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
          <h2 style={{ marginTop: 0 }}>3. 프롬프트 개선안 구조</h2>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, background: overallImproved ? 'rgba(74, 222, 128, 0.12)' : 'rgba(248, 113, 113, 0.12)', color: overallImproved ? '#4ade80' : '#f87171' }}>
              {overallImproved ? '✅ 전체 평균 개선됨' : '⚠️ 전체 평균 개선 안 됨'}
            </span>
            <span style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, background: safetyDropped ? 'rgba(248, 113, 113, 0.12)' : 'rgba(74, 222, 128, 0.12)', color: safetyDropped ? '#f87171' : '#4ade80' }}>
              {safetyDropped ? '🚨 안전성 점수 하락 — 반드시 검토 필요' : '🛡️ 안전성 점수 유지/개선'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {renderMetricCard('Average Score', baselineOverall?.totalScore, candidateOverall.totalScore)}
            {renderMetricCard('Coherence (일관성)', baselineOverall?.coherence, candidateOverall.coherence)}
            {renderMetricCard('Relevance (관련성)', baselineOverall?.relevance, candidateOverall.relevance)}
            {renderMetricCard('Safety (안전성)', baselineOverall?.safety, candidateOverall.safety)}
          </div>
        </div>

        {/* Improvement proposal + adopt — moved above the detailed comparison so the
            actual recommendation is the first thing seen, with supporting evidence below. */}
        <div className="results-area glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0 }}>개선 제안</h3>
          <p style={{ fontSize: '0.85rem', lineHeight: '1.5' }}>{optimizationCandidate.summaryText}</p>

          {optimizationCandidate.changes.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <h4 style={{ fontSize: '0.85rem' }}>수정 항목</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {optimizationCandidate.changes.map((c, idx) => (
                  <div key={idx} style={{ fontSize: '0.8rem', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '8px 10px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>{c.title}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{c.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {optimizationCandidate.risks.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <h4 style={{ fontSize: '0.85rem' }}>⚠️ 회귀/검토 주의사항</h4>
              <ul style={{ fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: '18px' }}>
                {optimizationCandidate.risks.map((r, idx) => <li key={idx}>{r}</li>)}
              </ul>
            </div>
          )}

          <div style={{ marginTop: '12px' }}>
            <h4 style={{ fontSize: '0.85rem' }}>🔍 프롬프트 변경 사항 (기존 → 개선안)</h4>
            {optimizationBaseline?.systemPrompt ? (
              promptHasChanges ? (
                <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: '1.6', maxHeight: '280px', overflowY: 'auto', background: '#0d0f13', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '10px 12px' }}>
                  {promptDiff.map((line, idx) => (
                    <div
                      key={idx}
                      style={{
                        whiteSpace: 'pre-wrap',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: line.type === 'added' ? 'rgba(74,222,128,0.12)' : line.type === 'removed' ? 'rgba(248,113,113,0.12)' : 'transparent',
                        color: line.type === 'added' ? '#4ade80' : line.type === 'removed' ? '#f87171' : 'inherit',
                        textDecoration: line.type === 'removed' ? 'line-through' : 'none'
                      }}
                    >
                      {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}{line.text || ' '}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>후보 프롬프트가 기존 프롬프트와 동일합니다.</p>
              )
            ) : (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>기준 프롬프트 정보가 없어 비교할 수 없습니다.</p>
            )}
          </div>

          <div className="input-section" style={{ marginTop: '16px' }}>
            <label htmlFor="candidate-prompt">후보 프롬프트 (수정 가능)</label>
            <textarea
              id="candidate-prompt"
              rows={10}
              value={optimizationCandidatePrompt}
              onChange={(e) => setOptimizationCandidatePrompt(e.target.value)}
              style={{ fontSize: '0.85rem', lineHeight: '1.4', backgroundColor: '#111419' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
            <button className="btn-icon" onClick={() => setOptimizationStep('results')} style={{ fontSize: '0.8rem', padding: '6px 12px', backgroundColor: 'var(--surface)' }}>
              ← 2. 테스트 결과로
            </button>
            <button className="btn-primary" onClick={handleAdoptOptimizationCandidate} disabled={!optimizationCandidatePrompt.trim()}>
              ✅ 개선안 채택
            </button>
          </div>
        </div>

        {/* 기존 비교, 이후 구조 비교: 케이스별 기존/개선 결과물 나란히 노출 */}
        <div className="results-area glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0 }}>기존 프롬프트 결과물 vs 개선 프롬프트 결과물</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
            {pairedResults.map(({ base, candidate }) => (
              <div key={`${candidate.caseId}-${candidate.modelId}`} style={{ border: '1px solid var(--surface-border)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span><strong>[{candidate.category}]</strong> {candidate.userInput}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    {renderCaseImprovementBadge(base, candidate)}
                    <span style={{ color: 'var(--text-muted)' }}>{candidate.modelName}</span>
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <div style={{ padding: '12px', borderRight: '1px solid var(--surface-border)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>기존 프롬프트 결과물 (잘 안된 부분 강조)</div>
                    {base ? (
                      <>
                        <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{base.aiOutput}</pre>
                        <div style={{ marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '6px' }}>Total {base.totalScore}</span>
                          {DIMENSION_DEFS.map(({ key, label }) => renderBaselineDimensionChip(label, base[key]))}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{base.judgeFeedback}</div>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>기준 결과 없음</span>
                    )}
                  </div>
                  <div style={{ padding: '12px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#a5b4fc', marginBottom: '6px' }}>개선 프롬프트 결과물 (개선/하락 강조)</div>
                    <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{candidate.aiOutput}</pre>
                    <div style={{ marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '6px' }}>
                        Total {candidate.totalScore} {base && renderOptimizationScoreDelta(base.totalScore, candidate.totalScore)}
                      </span>
                      {DIMENSION_DEFS.map(({ key, label }) => renderCandidateDimensionChip(label, base ? base[key] : undefined, candidate[key]))}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{candidate.judgeFeedback}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 피드백 현황: 기존/개선 각각에서 여전히 낮은 점수인 사례 */}
        {(optimizationBaseline?.summary?.lowScoreCases?.length > 0 || optimizationCandidate.summary.lowScoreCases.length > 0) && (
          <div className="results-area glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0 }}>피드백 현황 (낮은 점수 사례)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>기존 프롬프트</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(optimizationBaseline?.summary?.lowScoreCases || []).length === 0 ? (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>낮은 점수 사례가 없습니다.</p>
                  ) : optimizationBaseline.summary.lowScoreCases.map(c => (
                    <div key={c.id} style={{ border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '8px 10px', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                        <span><strong>[{c.category}]</strong> {c.modelName}</span>
                        <span style={{ fontWeight: 700, color: c.totalScore >= 5 ? '#fbbf24' : '#f87171' }}>{c.totalScore} / 10</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.judgeFeedback}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>개선 프롬프트 (재검증 후)</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {optimizationCandidate.summary.lowScoreCases.length === 0 ? (
                    <p style={{ fontSize: '0.75rem', color: '#4ade80' }}>낮은 점수 사례가 없습니다. 🎉</p>
                  ) : optimizationCandidate.summary.lowScoreCases.map(c => (
                    <div key={c.id} style={{ border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '8px 10px', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                        <span><strong>[{c.category}]</strong> {c.modelName}</span>
                        <span style={{ fontWeight: 700, color: c.totalScore >= 5 ? '#fbbf24' : '#f87171' }}>{c.totalScore} / 10</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.judgeFeedback}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Version history */}
        {optimizationVersions.length > 0 && (
          <div className="results-area glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ marginTop: 0 }}>최근 채택 버전</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {optimizationVersions.map(v => (
                <div key={v.id} style={{ border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '10px 12px', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong>{v.scenarioName}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(v.createdAt).toLocaleString()}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    기준 {v.baselineScore?.totalScore ?? '-'} → 개선안 {v.candidateScore?.totalScore ?? '-'}
                    {v.baselineScore && v.candidateScore && <> {renderOptimizationScoreDelta(v.baselineScore.totalScore, v.candidateScore.totalScore)}</>}
                  </div>
                  {v.changes?.length > 0 && (
                    <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>
                      변경 요약: {v.changes.map(c => c.title).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  const renderOptimizationWorkspace = () => (
    <>
      {renderOptimizationStepNav()}
      {optimizationStep === 'setting' && renderOptimizationSettingStep()}
      {optimizationStep === 'results' && renderOptimizationResultsStep()}
      {optimizationStep === 'compare' && renderOptimizationCompareStep()}
    </>
  );

  // ==========================================================================
  // Legacy Excel Batch Mode UI — preserved intentionally per request, but no
  // longer reachable from the tab bar (the 'auto' tab now renders
  // renderOptimizationWorkspace() instead). All state/handlers this depends on
  // (batchRows, handleRunBatch, handleExcelUpload, etc.) are untouched, so this
  // can be wired back into the 'auto' branch above if ever needed again.
  // Prefixed with `_` so the unused-function stays lint-clean.
  // ==========================================================================
  const _renderLegacyBatchWorkspace = () => (
    <>
      <div className="top-panel">
        {/* Auto Mode Config Panel */}
        <div className="input-panel glass-panel">
          {renderPromptScenarioSelector()}
          <div className="input-section">
            <label htmlFor="batch-prompt">System Prompt Template</label>
            <textarea
              id="batch-prompt"
              rows={4}
              placeholder="시스템 프롬프트 템플릿을 입력하세요. 엑셀 열 제목에 맞게 {{변수명}}을 입력하면 치환됩니다."
              value={prompt}
              onChange={(e) => handleSystemPromptChange(e.target.value)}
            />
          </div>

          <div className="input-section" style={{ marginTop: '12px' }}>
            <label>Excel File Upload</label>
            <div
              className="file-upload-zone"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => document.getElementById('excel-file-input').click()}
            >
              <div className="upload-icon">📂</div>
              {batchFilename ? (
                <div>
                  <p style={{ fontWeight: 'bold' }}>{batchFilename}</p>
                  <p className="file-info">✓ {batchRows.length}개의 데이터 행 감지됨</p>
                </div>
              ) : (
                <div>
                  <p>여기로 엑셀 파일을 드래그하거나 클릭하여 업로드하세요</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    지원 형식: .xlsx, .xls
                  </p>
                </div>
              )}
              <input
                type="file"
                id="excel-file-input"
                accept=".xlsx, .xls"
                onChange={handleExcelUpload}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div className="input-section" style={{ marginTop: '12px' }}>
            <label>Select Models</label>
            <div className="models-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {AVAILABLE_MODELS.map((model) => {
                const isSelected = selectedModels.includes(model.id);
                return (
                  <div key={model.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label className={`model-checkbox-label ${isSelected ? 'selected' : ''}`} style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleModel(model.id)}
                      />
                      <span>{model.name}</span>
                    </label>
                    <ModelConfigOptions model={model} config={isSelected ? modelConfigs[model.id] : null} onChange={(key, value) => setModelConfigs(prev => ({ ...prev, [model.id]: { ...prev[model.id], [key]: value } }))} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="run-actions" style={{ marginTop: '16px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            {batchIsRunning ? (
              <button className="btn-primary" onClick={handleStopBatch} style={{ backgroundColor: 'var(--error)' }}>
                Stop Batch
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleRunBatch}
                disabled={selectedModels.length === 0 || batchRows.length === 0 || !prompt.trim()}
              >
                🚀 Run Batch
              </button>
            )}
          </div>
        </div>

        {/* Guidelines / Help */}
        <div className="variable-mapping-panel glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3>Batch Guidelines</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            대량 자동 모드는 업로드한 엑셀 파일의 행들을 돌며 순차적으로 AI 모델 답변 생성 및 채점을 수행합니다.
          </p>
          <hr style={{ borderColor: 'var(--surface-border)', opacity: 0.5 }} />
          <h4 style={{ fontSize: '0.9rem' }}>💡 엑셀 필수 조건</h4>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-muted)', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', listStyleType: 'disc' }}>
            <li>첫 번째 행은 반드시 <strong>열 제목(Header)</strong>이어야 합니다.</li>
            <li>사용자 입력(학생 발화)이 담긴 열이 있어야 합니다. (예: <code>Input</code>, <code>User Input</code>, <code>Conversation</code>)</li>
            <li>프롬프트 템플릿의 <code>{"{{변수명}}"}</code>과 동일한 이름의 열이 있다면 자동으로 해당 값이 치환됩니다.</li>
          </ul>
          {batchHeaders.length > 0 && (
            <>
              <hr style={{ borderColor: 'var(--surface-border)', opacity: 0.5 }} />
              <h4 style={{ fontSize: '0.9rem' }}>✓ 감지된 열 목록</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {batchHeaders.map(h => (
                  <span key={h} style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--surface-border)' }}>
                    {h}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Batch Progress Bar */}
      {batchProgress.total > 0 && (batchIsRunning || batchResults.length > 0) && (
        <div className="progress-container" style={{ marginTop: '20px' }}>
          <div className="progress-header">
            <span>진행 상태: {batchProgress.statusText}</span>
            <span>{batchProgress.current} / {batchProgress.total} 행 ({batchProgress.percentage}%)</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${batchProgress.percentage}%` }}></div>
          </div>
        </div>
      )}

      {/* Model Averages Dashboard for Batch */}
      {Object.keys(batchModelAverages).length > 0 && (
        <div className="dashboard-panel glass-panel" style={{ padding: '20px', marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Batch Model Performance</h3>
            <button className="btn-primary" onClick={handleExportBatchExcel} style={{ padding: '6px 12px', fontSize: '0.9rem' }}>
              📊 Export Batch Results
            </button>
          </div>
          <div className="dashboard-cards" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {Object.entries(batchModelAverages).map(([modelName, avg]) => (
              <div key={modelName} className="dashboard-card" style={{ flex: '1 1 200px', backgroundColor: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text)' }}>{modelName}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--primary)' }}>{avg.total}</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/ 10 avg ({avg.count} rows)</div>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  <div>Coherence: {avg.rule}</div>
                  <div>Relevance: {avg.relevance}</div>
                  <div>Safety: {avg.safety}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Batch Results Table */}
      {batchResults.length > 0 && (
        <div className="results-area" style={{ marginTop: '20px' }}>
          <h3>Detailed Evaluation Results</h3>
          <div className="batch-table-container">
            <table className="batch-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Row</th>
                  <th style={{ width: '150px' }}>Model</th>
                  <th style={{ width: '200px' }}>Variables</th>
                  <th style={{ width: '250px' }}>Input</th>
                  <th style={{ width: '300px' }}>AI Response</th>
                  <th style={{ width: '120px' }}>Scores</th>
                  <th>Judge Feedback</th>
                </tr>
              </thead>
              <tbody>
                {batchResults.map((result) => (
                  <tr key={result.id} style={{ opacity: result.isError ? 0.7 : 1 }}>
                    <td>
                      <span className="badge-row-id">#{result.rowIndex}</span>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{result.modelName}</td>
                    <td>
                      <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {Object.entries(result.variables).map(([k, v]) => (
                          <div key={k}><strong>{k}:</strong> {String(v)}</div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <pre style={{ fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-wrap' }}>{result.userInput}</pre>
                        <button
                          className="btn-icon"
                          onClick={() => setAddToGoldenCase({ userInput: result.userInput, description: `배치 결과 ${result.rowIndex}행에서 추가됨` })}
                          title="프롬프트 테스트 시나리오에 추가"
                        >
                          🎯
                        </button>
                      </div>
                    </td>
                    <td>
                      <pre style={{ fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-wrap' }}>{result.aiOutput}</pre>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{result.totalScore}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>avg</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <strong>Coherence:</strong> {result.ruleScore} | <strong>Relevance:</strong> {result.relevanceScore} | <strong>Safety:</strong> {result.safetyScore}
                        <br/>
                        <strong>Reason:</strong> {result.judgeFeedback}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>AI Prompt Comparer</h1>
        <p>Test and compare responses from various AI models side-by-side</p>
        <div className="daily-api-usage">
          <button type="button" className="daily-api-usage-toggle" onClick={() => setIsDailyUsageOpen(previous => !previous)} aria-expanded={isDailyUsageOpen}>
            {isDailyUsageOpen ? <span className="daily-api-usage-summary" title={Object.entries(todayApiUsage.models || {}).map(([modelId, usage]) => `${modelId}: ${usage.calls} calls, ${(usage.totalTokens || 0).toLocaleString()} tokens`).join('\n')}>
              오늘 API 호출 <strong>{todayApiUsage.calls.toLocaleString()}회</strong> · 입력 {todayApiUsage.inputTokens.toLocaleString()} · 출력 {todayApiUsage.outputTokens.toLocaleString()} · 총 <strong>{todayApiUsage.totalTokens.toLocaleString()} tokens</strong>
            </span> : <span>{ENGLISH_QUOTES[dailyQuoteIndex]}</span>}
            <small>{isDailyUsageOpen ? 'Quote' : 'Usage'}</small>
          </button>
        </div>
      </header>

      <div className="mode-tabs">
        <button
          className={`tab-btn ${activeMode === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveMode('manual')}
        >
          💬 단건 테스트
        </button>
        <button
          className={`tab-btn ${activeMode === 'auto' ? 'active' : ''}`}
          onClick={() => setActiveMode('auto')}
        >
          🛠️ 프롬프트 개선
        </button>
        <button
          className={`tab-btn ${activeMode === 'goldenset' ? 'active' : ''}`}
          onClick={() => setActiveMode('goldenset')}
        >
          🎯 테스트셋 · 골든셋
        </button>
      </div>

      <div className="main-content">
        {activeMode === 'manual' ? (
          <>
            <div className="top-panel">
          {/* Input Panel */}
          <div className="input-panel glass-panel">
            <ManualScenarioSelector
              goldenSets={goldenSets}
              activityFilter={manualActivityFilter}
              scenarioId={manualScenarioId}
              onActivityChange={(activity) => {
                setManualActivityFilter(activity);
                handleManualScenarioChange('default');
              }}
              onScenarioChange={handleManualScenarioChange}
            />

            {manualTestMode === 'single' && false && (
            <div className="input-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="conversation">
                  {manualTestMode === 'multi'
                    ? '다음 메시지'
                    : manualActiveScenario.id !== 'default' && manualActiveScenario.testCases && manualActiveScenario.testCases.length > 0
                    ? "직접 입력 발화 (Custom Input / Fallback)"
                    : "Message / Script"}
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-icon" onClick={handleGenerateBeginnerScript} title="Auto Generate Beginner Script" style={{ fontSize: '0.8rem', padding: '4px 8px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}>
                    ✨ Beginner (A1)
                  </button>
                  <button className="btn-icon" onClick={handleGenerateIntermediateScript} title="Auto Generate Intermediate Script" style={{ fontSize: '0.8rem', padding: '4px 8px', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#4ade80' }}>
                    ✨ Intermediate (B1)
                  </button>
                </div>
              </div>
              <textarea 
                id="conversation"
                rows={3}
                placeholder={manualTestMode === 'multi' ? '대화를 이어갈 다음 메시지를 입력하세요.' : 'Type your message or generate a script to start...'}
                value={conversation}
                onChange={(e) => { setConversation(e.target.value); setMultiTurnCaseId(''); }}
              />
            </div>
            )}
            <div className="input-section" style={{ marginTop: '12px' }}>
              <label htmlFor="prompt">System Prompt</label>
              <textarea
                id="prompt"
                rows={3}
                placeholder="Enter the system prompt instructions here. Use {{variable_name}} for dynamic inputs."
                value={manualPrompt}
                onChange={(e) => setManualPrompt(e.target.value)}
              />
            </div>
            <div className="run-actions" style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {manualTestMode === 'single' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={skipAIEvaluation}
                    onChange={event => setSkipAIEvaluation(event.target.checked)}
                  />
                  AI 평가 제외
                </label>
              )}
            </div>
          </div>

          {/* Right Panel: Variable Mapping Table */}
          <div className="variable-mapping-panel glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3>Variable Mapping Management</h3>
            {manualTestMode !== 'single' && renderPresetSelector(manualActiveScenario.id)}
            
            {uniqueManualVariables.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No variables detected. Use {`{{variable_name}}`} in the System Prompt to create variables.
              </p>
            ) : (
              <div className="input-section variables-section">
                <div className="variables-grid" style={{ gridTemplateColumns: '1fr', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                  {uniqueManualVariables.map(key => (
                    <div key={key} className="variable-input-row" style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <span style={{ width: '100px', flexShrink: 0 }}>{key}</span>
                      <input 
                        type="text" 
                        value={focusedVariableKey === key ? (promptVariables[key] || '') : abbreviateVariableValue(promptVariables[key])}
                        onFocus={() => setFocusedVariableKey(key)}
                        onBlur={() => setFocusedVariableKey(null)}
                        onChange={(e) => handleVariableChange(key, e.target.value)}
                        placeholder={`Value for ${key}`}
                        style={{ flex: 1 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <hr style={{ display: 'none' }} />

            <div className="mapping-presets" style={{ display: 'none' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-muted)' }}>Saved Presets</h4>

              <select
                value={selectedPresetId}
                onChange={(e) => {
                  const mapping = savedMappings.find(item => item.id === e.target.value);
                  if (mapping) handleLoadMapping(mapping);
                  else setSelectedPresetId('');
                }}
                style={{ width: '100%', marginBottom: '10px', padding: '8px', borderRadius: '6px', border: '1px solid var(--surface-border)', backgroundColor: '#111419', color: 'var(--text)' }}
              >
                <option value="">프리셋 선택 안 함</option>
                {savedMappings.map(mapping => (
                  <option key={mapping.id} value={mapping.id}>{mapping.name} · {formatVariablePresetSummary(mapping.variables)}</option>
                ))}
              </select>
              
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input 
                  type="text" 
                  placeholder="Preset Name" 
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  style={{ flex: 1, padding: '8px' }}
                />
                <button 
                  className="btn-primary" 
                  onClick={() => handleSaveMapping(manualActiveScenario.id)}
                  disabled={!presetName.trim()}
                  style={{ padding: '8px 16px' }}
                >
                  Save
                </button>
              </div>

              {savedMappings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                  {savedMappings.map(mapping => (
                    <div key={mapping.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: '10px 12px', borderRadius: '6px' }}>
                      <div style={{ paddingRight: '12px', overflow: 'hidden' }}>
                        <div style={{ fontWeight: 500, marginBottom: '4px' }}>{mapping.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                          {formatVariablePresetSummary(mapping.variables)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn-icon" onClick={() => handleLoadMapping(mapping)} title="Load Preset">
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                        <button className="btn-icon" onClick={() => handleDeleteMapping(mapping.id)} title="Delete Preset" style={{ color: 'var(--error)' }}>
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {manualTestMode === 'single' && (
          <FloatingSingleTurnRunner
            isOpen={isSingleTurnRunnerOpen}
            onToggle={() => setIsSingleTurnRunnerOpen(previous => !previous)}
            onTestModeChange={() => { setManualTestMode('multi'); setIsMultiTurnChatOpen(true); }}
            onReset={handleResetSingleTurn}
            models={AVAILABLE_MODELS}
            selectedModelId={selectedModels[0] || AVAILABLE_MODELS[0]?.id}
            onModelChange={handleFloatingModelChange}
            modelConfig={modelConfigs[selectedModels[0] || AVAILABLE_MODELS[0]?.id] || {}}
            onModelConfigChange={(key, value) => {
              const modelId = selectedModels[0] || AVAILABLE_MODELS[0]?.id;
              if (!modelId) return;
              setModelConfigs(previous => ({ ...previous, [modelId]: { ...previous[modelId], [key]: value } }));
            }}
            resultCount={resultCount}
            onResultCountChange={count => setResultCount(Math.min(10, Math.max(1, count || 1)))}
            presets={savedMappings.filter(mapping => mapping.scenarioId === manualActiveScenario.id)}
            selectedPresetId={selectedPresetId}
            onPresetChange={presetId => {
              setSelectedMultiPresetIds([]);
              const mapping = savedMappings.find(item => item.id === presetId);
              if (mapping) handleLoadMapping(mapping);
              else {
                setSelectedPresetId('');
                setPromptVariables({});
              }
            }}
            selectedMultiPresetIds={selectedMultiPresetIds}
            onMultiPresetToggle={presetId => setSelectedMultiPresetIds(previous => (
              previous.includes(presetId) ? previous.filter(id => id !== presetId) : [...previous, presetId]
            ))}
            onSetAllMultiPresets={selected => setSelectedMultiPresetIds(selected
              ? savedMappings.filter(mapping => mapping.scenarioId === manualActiveScenario.id).map(mapping => mapping.id)
              : []
            )}
            message={conversation}
            onMessageChange={setConversation}
            onRun={handleRun}
            isRunning={manualIsRunning}
            canRun={selectedModels.length > 0 && Boolean(manualPrompt.trim() || conversation.trim() || selectedManualCases.length > 0)}
          />
        )}

        {/* 테스트 케이스 목록 (Test Case List) — read-only reference into the scenario picked
            above; adding/editing/deleting cases only happens in '테스트셋 · 골든셋' tab. */}
        {manualTestMode === 'single' && manualActiveScenario.id !== 'default' && (
          <div className="results-area" style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>테스트 케이스 목록 ({manualActiveScenario.testCases.length} Cases)</h3>

              {/* Selection helpers only — case add/edit/delete lives in '테스트셋 · 골든셋' */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn-icon"
                  onClick={() => setSelectedManualCases(manualActiveScenario.testCases.map(c => c.id))}
                  style={{ fontSize: '0.8rem', padding: '4px 8px', backgroundColor: 'var(--surface)' }}
                >
                  Select All
                </button>
                <button
                  className="btn-icon"
                  onClick={() => setSelectedManualCases([])}
                  style={{ fontSize: '0.8rem', padding: '4px 8px', backgroundColor: 'var(--surface)' }}
                >
                  Clear Selection
                </button>
              </div>
            </div>

            <div className="batch-table-container">
              <table className="batch-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}><input type="checkbox" checked={manualActiveScenario.testCases.length > 0 && selectedManualCases.length === manualActiveScenario.testCases.length} onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedManualCases(manualActiveScenario.testCases.map(c => c.id));
                      } else {
                        setSelectedManualCases([]);
                      }
                    }} /></th>
                    <th style={{ width: '160px' }}>Category</th>
                    <th style={{ width: '450px' }}>User Input Text (학생 발화)</th>
                    <th>Reason/Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {manualActiveScenario.testCases.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                        등록된 테스트 케이스가 없습니다. '테스트셋 · 골든셋' 탭에서 케이스를 추가해 주세요.
                      </td>
                    </tr>
                  ) : (
                    manualActiveScenario.testCases.map((testCase) => {
                      const isChecked = selectedManualCases.includes(testCase.id);

                      const badgeStyles = {
                        '정상 케이스': { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
                        '오류 케이스': { bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
                        '엣지 케이스': { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
                        '안정성 케이스': { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' }
                      };
                      const cstyle = badgeStyles[testCase.category] || { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' };

                      return (
                        <tr key={testCase.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedManualCases(prev => [...prev, testCase.id]);
                                } else {
                                  setSelectedManualCases(prev => prev.filter(id => id !== testCase.id));
                                }
                              }}
                            />
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                backgroundColor: cstyle.bg,
                                color: cstyle.color
                              }}
                            >
                              {testCase.category}
                            </span>
                          </td>
                          <td>
                            <pre style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', margin: 0 }}>{testCase.userInput}</pre>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'normal', wordBreak: 'break-all' }}>
                            {testCase.description}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {manualProgress.total > 0 && (manualIsRunning || manualResults.length > 0) && (
          <div className="progress-container" style={{ marginTop: '20px', marginBottom: '20px' }}>
            <div className="progress-header">
              <span>진행 상태: {manualProgress.statusText}</span>
              <span>{manualProgress.current} / {manualProgress.total} 작업 ({manualProgress.percentage}%)</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${manualProgress.percentage}%` }}></div>
            </div>
          </div>
        )}

        {/* Comparison Dashboard */}
        {Object.keys(manualModelAverages).length > 0 && (
          <div className="dashboard-panel glass-panel" style={{ marginBottom: '20px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Model Evaluation Dashboard</h3>
            </div>
            <div className="dashboard-cards" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {Object.entries(manualModelAverages).map(([modelName, avg]) => (
                <div key={modelName} className="dashboard-card" style={{ flex: '1 1 200px', backgroundColor: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text)' }}>{modelName}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--primary)' }}>{avg.total}</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/ 10 avg</div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div>Coherence: {avg.rule}</div>
                    <div>Relevance: {avg.relevance}</div>
                    <div>Safety: {avg.safety}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results Area */}
        <div className={`results-area ${manualTestMode === 'multi' && multiTurnHasConversation ? 'multi-turn-results-area' : ''}`}>
          <div className="results-area-header">
            <h3>Comparison Results</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {manualTestMode === 'single' && manualResults.length > 0 && (
                <button className="btn-primary" onClick={handleExportExcel} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Excel 내보내기</button>
              )}
              {manualTestMode === 'multi' && multiTurnHasConversation && (
                <>
                  <button className="btn-primary" onClick={handleExportMultiTurnExcel} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Excel 내보내기</button>
                  <button className="btn-icon" onClick={handleResetMultiTurnConversation} style={{ padding: '6px 12px', fontSize: '0.85rem', color: 'var(--error)' }}>전체 초기화</button>
                </>
              )}
              {(manualResults.length > 0 || testHistory.length > 0) && (
                 <button 
                   className="btn-icon"
                   title="Clear Everything"
                   onClick={() => { setManualResults([]); setTestHistory([]); }}
                   style={{ backgroundColor: 'var(--surface)', padding: '6px 12px', fontSize: '0.85rem' }}
                 >
                   Clear All
                 </button>
              )}
            </div>
          </div>
          
          {manualTestMode === 'multi' && (
            <div style={{ marginTop: '20px' }}><MultiTurnResults sessions={multiTurnSessionList} activeSessionKey={activeMultiTurnSession?.key} onSessionChange={setActiveMultiTurnSessionKey} /></div>
          )}

          {manualTestMode === 'single' && singlePresetResultTabs.length > 1 && (
            <div className="multi-turn-session-tabs" role="tablist" aria-label="변수 프리셋 결과 선택" style={{ marginTop: '20px' }}>
              {singlePresetResultTabs.map(tab => (
                <button key={tab.id} type="button" role="tab" aria-selected={tab.id === activeSinglePresetResult?.id} className={`multi-turn-session-tab ${tab.id === activeSinglePresetResult?.id ? 'is-active' : ''}`} onClick={() => handleSelectSinglePresetResult(tab.id)}>
                  {tab.name}<span>{tab.count}개 결과</span>
                </button>
              ))}
            </div>
          )}

          <div className="results-table-container" style={{ display: manualTestMode === 'multi' ? 'none' : 'block', overflowX: 'auto', marginTop: '20px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
            {selectedModels.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p>Select at least one model to see results.</p>
              </div>
            ) : (
              <table className="results-comparison-table" style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'var(--surface-color)', minWidth: `${800 + selectedModels.length * 300}px` }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '2px solid var(--surface-border)' }}>
                    <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)', borderRight: '1px solid var(--surface-border)', width: '250px' }}>
                      User Input (문장)
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)', borderRight: '1px solid var(--surface-border)', width: '150px' }}>
                      테스트 셋 분류
                    </th>
                    {selectedModels.map(modelId => {
                      const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId);
                      return (
                        <th key={modelId} style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)', borderRight: '1px solid var(--surface-border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.95rem' }}>{modelInfo?.name}</span>
                            <span className="model-badge" style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>{modelInfo?.provider}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Get all unique cases that were run
                    let uniqueCasesInResults = [];
                    const seen = new Set();
                    visibleManualResults.forEach(r => {
                      if (!seen.has(r.caseId)) {
                        seen.add(r.caseId);
                        const savedTestCase = manualActiveScenario.testCases.find(testCase => testCase.id === r.caseId);
                        uniqueCasesInResults.push({
                          id: r.caseId,
                          category: r.category,
                          userInput: r.userInput,
                          description: savedTestCase?.description || ''
                        });
                      }
                    });

                    // Sort uniqueCasesInResults according to their position in manualActiveScenario.testCases
                    uniqueCasesInResults.sort((a, b) => {
                      const idxA = manualActiveScenario.testCases.findIndex(c => c.id === a.id);
                      const idxB = manualActiveScenario.testCases.findIndex(c => c.id === b.id);
                      if (idxA === -1 && idxB === -1) return 0;
                      if (idxA === -1) return 1;
                      if (idxB === -1) return -1;
                      return idxA - idxB;
                    });

                    // If manual run is running and we haven't loaded results yet, populate rows from casesToRun
                    if (uniqueCasesInResults.length === 0) {
                      if (manualIsRunning) {
                        let casesToRun = [];
                        if (selectedManualCases.length > 0 && manualActiveScenario.id !== 'default') {
                          casesToRun = manualActiveScenario.testCases.filter(c => selectedManualCases.includes(c.id));
                        } else if (conversation.trim()) {
                          casesToRun = [{
                            id: 'custom-input',
                            category: '수동 입력',
                            userInput: conversation
                          }];
                        }
                        uniqueCasesInResults = casesToRun;
                      }
                    }

                    if (uniqueCasesInResults.length === 0) {
                      return (
                        <tr>
                          <td colSpan={selectedModels.length + 2} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            평가 대기 중... 테스트 케이스를 선택하거나 발화 내용을 입력하고 Send Message를 눌러주세요.
                          </td>
                        </tr>
                      );
                    }

                    const badgeStyles = {
                      '정상 케이스': { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
                      '오류 케이스': { bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
                      '엣지 케이스': { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
                      '안정성 케이스': { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
                      '수동 입력': { bg: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }
                    };

                    return uniqueCasesInResults.map(testCase => {
                      const cstyle = badgeStyles[testCase.category] || { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' };
                      
                      return (
                        <tr key={testCase.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                          {/* Column 1: User Input Text */}
                          <td style={{ padding: '16px', verticalAlign: 'top', borderRight: '1px solid var(--surface-border)', backgroundColor: 'rgba(255,255,255,0.01)', width: '250px' }}>
                            <div style={{ color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {testCase.userInput}
                            </div>
                            {testCase.description && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                                {testCase.description}
                              </div>
                            )}
                          </td>

                          {/* Column 2: Category */}
                          <td style={{ padding: '16px', verticalAlign: 'top', borderRight: '1px solid var(--surface-border)', backgroundColor: 'rgba(255,255,255,0.01)', width: '150px' }}>
                            <span style={{ 
                              display: 'inline-block', 
                              padding: '4px 8px', 
                              borderRadius: '4px', 
                              fontSize: '0.75rem', 
                              fontWeight: 'bold', 
                              backgroundColor: cstyle.bg, 
                              color: cstyle.color 
                            }}>
                              {testCase.category}
                            </span>
                          </td>

                          {/* Selected Model Columns */}
                          {selectedModels.map(modelId => {
                            const r = visibleManualResults.find(res => res.caseId === testCase.id && res.modelId === modelId);
                            const isCurrentlyRunning = manualIsRunning && !r;

                            return (
                              <td key={modelId} style={{ padding: '16px', verticalAlign: 'top', borderRight: '1px solid var(--surface-border)', width: `${70 / selectedModels.length}%` }}>
                                {r ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {r.results && r.results.length > 0 ? (
                                      r.results.map((res, rIdx) => (
                                        <div key={rIdx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: r.results.length > 1 && rIdx < r.results.length - 1 ? '1px dashed var(--surface-border)' : 'none', paddingBottom: r.results.length > 1 && rIdx < r.results.length - 1 ? '12px' : '0' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Response {res.index}</span>
                                            {res.evaluation && res.evaluation.total_avg !== undefined && (
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <table style={{ borderCollapse: 'collapse', fontSize: '0.7rem', textAlign: 'center', border: '1px solid var(--surface-border)', background: 'var(--surface-color)', borderRadius: '4px', overflow: 'hidden' }}>
                                                  <thead>
                                                    <tr style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                                                      <th style={{ padding: '2px 4px', border: '1px solid var(--surface-border)', fontWeight: 600 }}>일관</th>
                                                      <th style={{ padding: '2px 4px', border: '1px solid var(--surface-border)', fontWeight: 600 }}>관련</th>
                                                      <th style={{ padding: '2px 4px', border: '1px solid var(--surface-border)', fontWeight: 600 }}>안전</th>
                                                      <th style={{ padding: '2px 4px', border: '1px solid var(--surface-border)', fontWeight: 600, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--text-main)' }}>평균</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    <tr style={{ color: 'var(--text-main)' }}>
                                                      <td style={{ padding: '2px 4px', border: '1px solid var(--surface-border)' }}>
                                                        {res.evaluation.scores?.coherence !== undefined ? res.evaluation.scores.coherence : (res.evaluation.scores?.rule || 0)}
                                                      </td>
                                                      <td style={{ padding: '2px 4px', border: '1px solid var(--surface-border)' }}>
                                                        {res.evaluation.scores?.relevance || 0}
                                                      </td>
                                                      <td style={{ padding: '2px 4px', border: '1px solid var(--surface-border)' }}>
                                                        {res.evaluation.scores?.safety || 0}
                                                      </td>
                                                      <td style={{ padding: '2px 4px', border: '1px solid var(--surface-border)', fontWeight: 'bold', background: 'rgba(99, 102, 241, 0.05)', color: 'var(--primary-color)' }}>
                                                        {res.evaluation.total_avg || 0}
                                                      </td>
                                                    </tr>
                                                  </tbody>
                                                </table>
                                                <div className={`score-badge tooltip ${res.evaluation.total_avg >= 8 ? 'good' : (res.evaluation.total_avg >= 5 ? 'fair' : 'poor')}`} style={{ padding: '4px', borderRadius: '4px', cursor: 'help' }}>
                                                  {res.evaluation.total_avg >= 8 ? '🟢' : (res.evaluation.total_avg >= 5 ? '🟡' : '🔴')}
                                                  <span className="tooltiptext" style={{ minWidth: '240px', textAlign: 'left' }}>
                                                    <strong>Judge Scores (상세 점수)</strong>
                                                    <hr style={{ margin: '4px 0', borderColor: 'var(--surface-border)' }} />
                                                    Coherence (일관성): {res.evaluation.scores?.coherence !== undefined ? res.evaluation.scores.coherence : (res.evaluation.scores?.rule || 0)} / 10
                                                    {res.evaluation.scores?.coherence_breakdown && (
                                                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', paddingLeft: '8px', marginBottom: '4px' }}>
                                                        • 포맷 및 구조: {res.evaluation.scores.coherence_breakdown.format_structure ?? '-'} / 4.0<br/>
                                                        • 문법 및 시제: {res.evaluation.scores.coherence_breakdown.grammar_tense ?? '-'} / 2.5<br/>
                                                        • 수량 제약: {res.evaluation.scores.coherence_breakdown.word_count ?? '-'} / 2.5<br/>
                                                        • 특정 단어: {res.evaluation.scores.coherence_breakdown.specific_words ?? '-'} / 1.0
                                                      </div>
                                                    )}
                                                    Relevance (관련성): {res.evaluation.scores?.relevance || 0} / 10
                                                    {res.evaluation.scores?.relevance_breakdown && (
                                                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', paddingLeft: '8px', marginBottom: '4px' }}>
                                                        • 맥락 및 의도: {res.evaluation.scores.relevance_breakdown.context_intent ?? '-'} / 4.0<br/>
                                                        • 상호작용 및 흐름: {res.evaluation.scores.relevance_breakdown.flow_control ?? '-'} / 4.0<br/>
                                                        • 피드백 품질: {res.evaluation.scores.relevance_breakdown.feedback_quality ?? '-'} / 2.0
                                                      </div>
                                                    )}
                                                    Safety (제약 및 안전): {res.evaluation.scores?.safety || 0} / 10
                                                    {res.evaluation.scores?.safety_breakdown && (
                                                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', paddingLeft: '8px', marginBottom: '4px' }}>
                                                        • 언어 수준 적절성: {res.evaluation.scores.safety_breakdown.language_leveling ?? '-'} / 5.0<br/>
                                                        • 기계적 답변 지양: {res.evaluation.scores.safety_breakdown.over_safety_avoidance ?? '-'} / 2.5<br/>
                                                        • 정서적 지지: {res.evaluation.scores.safety_breakdown.emotional_support ?? '-'} / 2.5
                                                      </div>
                                                    )}
                                                    <hr style={{ margin: '4px 0', borderColor: 'var(--surface-border)' }} />
                                                    <em>{res.evaluation.reason}</em>
                                                  </span>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                          
                                          <div style={{ color: 'var(--text-main)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: '1.5', backgroundColor: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>{res.text}</div>
                                          
                                          {res.evaluation && (
                                            <div className="evaluation-box" style={{ marginTop: '4px', padding: '8px', background: 'rgba(26, 29, 36, 0.4)', border: '1px solid var(--surface-border)', borderRadius: '6px' }}>
                                              <details style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                                <summary style={{ fontWeight: 'bold', outline: 'none', userSelect: 'none', cursor: 'pointer', color: 'var(--text-main)' }}>
                                                  📊 상세 평가 결과 및 이유 (펼침/닫힘)
                                                </summary>
                                                
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', marginBottom: '6px' }}>
                                                  <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>평가 점수 표</span>
                                                  <button 
                                                    onClick={() => handleCopyScores(res.evaluation)}
                                                    style={{
                                                      background: 'rgba(99, 102, 241, 0.1)',
                                                      color: '#818cf8',
                                                      border: '1px solid rgba(99, 102, 241, 0.3)',
                                                      padding: '2px 6px',
                                                      borderRadius: '4px',
                                                      fontSize: '0.7rem',
                                                      cursor: 'pointer'
                                                    }}
                                                  >
                                                    📋 엑셀로 복사
                                                  </button>
                                                </div>

                                                <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
                                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', textAlign: 'center', border: '1px solid var(--surface-border)' }}>
                                                    <thead>
                                                      <tr style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                                                        <th style={{ padding: '4px 2px', border: '1px solid var(--surface-border)', fontWeight: 600 }}>Coherence<br/>(일관성)</th>
                                                        <th style={{ padding: '4px 2px', border: '1px solid var(--surface-border)', fontWeight: 600 }}>Relevance<br/>(관련성)</th>
                                                        <th style={{ padding: '4px 2px', border: '1px solid var(--surface-border)', fontWeight: 600 }}>Safety<br/>(제약 및 안전)</th>
                                                        <th style={{ padding: '4px 2px', border: '1px solid var(--surface-border)', fontWeight: 600, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--text-main)' }}>Average<br/>(평균)</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      <tr>
                                                        <td style={{ padding: '4px 2px', border: '1px solid var(--surface-border)', color: '#fff' }}>
                                                          {res.evaluation.scores?.coherence !== undefined ? res.evaluation.scores.coherence : (res.evaluation.scores?.rule || 0)}
                                                        </td>
                                                        <td style={{ padding: '4px 2px', border: '1px solid var(--surface-border)', color: '#fff' }}>
                                                          {res.evaluation.scores?.relevance || 0}
                                                        </td>
                                                        <td style={{ padding: '4px 2px', border: '1px solid var(--surface-border)', color: '#fff' }}>
                                                          {res.evaluation.scores?.safety || 0}
                                                        </td>
                                                        <td style={{ padding: '4px 2px', border: '1px solid var(--surface-border)', fontWeight: 'bold', color: 'var(--primary-color)', background: 'rgba(99, 102, 241, 0.05)' }}>
                                                          {res.evaluation.total_avg || 0}
                                                        </td>
                                                      </tr>
                                                    </tbody>
                                                  </table>
                                                </div>

                                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.02)', lineHeight: '1.4', color: 'var(--text-muted)' }}>
                                                  <strong>상세 피드백:</strong> {res.evaluation.reason}
                                                </div>
                                              </details>
                                            </div>
                                          )}

                                          {!res.isError && res.responseTimeMs > 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                              ⏱️ {(res.responseTimeMs / 1000).toFixed(2)}s
                                            </div>
                                          )}
                                        </div>
                                      ))
                                    ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ color: 'var(--text-main)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: '1.5', backgroundColor: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>{r.aiOutput}</div>
                                      </div>
                                    )}
                                  </div>
                                ) : isCurrentlyRunning ? (
                                  <div className="loading-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '12px 0' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeLinecap="round" className="spinner-animation" />
                                    </svg>
                                    Generating/Evaluating...
                                  </div>
                                ) : (
                                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                    결과 없음 {manualIsRunning ? '(대기 중)' : ''}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            )}
          </div>
          </div>
          {manualTestMode === 'multi' && (
            <>
            <FloatingMultiTurnChat
              isOpen={isMultiTurnChatOpen}
              onToggle={() => setIsMultiTurnChatOpen(prev => !prev)}
              onTestModeChange={() => { setManualTestMode('single'); setIsSingleTurnRunnerOpen(true); setIsMultiTurnChatOpen(false); }}
              models={AVAILABLE_MODELS}
              selectedModelId={selectedModels[0] || AVAILABLE_MODELS[0]?.id}
              onModelChange={handleFloatingModelChange}
              modelConfig={modelConfigs[selectedModels[0] || AVAILABLE_MODELS[0]?.id] || {}}
              onModelConfigChange={(key, value) => {
                const modelId = selectedModels[0] || AVAILABLE_MODELS[0]?.id;
                if (!modelId) return;
                setModelConfigs(previous => ({ ...previous, [modelId]: { ...previous[modelId], [key]: value } }));
              }}
              isModelLocked={multiTurnHasConversation}
              sessionCount={resultCount}
              onSessionCountChange={value => setResultCount(Math.min(10, Math.max(1, parseInt(value) || 1)))}
              isSessionCountLocked={multiTurnHasConversation}
              sessions={multiTurnSessionList}
              activeSessionKey={activeMultiTurnSession?.key}
              onSessionChange={setActiveMultiTurnSessionKey}
              cases={manualActiveScenario.testCases || []}
              selectedCaseId={multiTurnDrafts[activeMultiTurnSession?.key]?.caseId || ''}
              onCaseChange={caseId => {
                const sessionKey = activeMultiTurnSession?.key;
                const testCase = manualActiveScenario.testCases?.find(item => item.id === caseId);
                if (sessionKey) setMultiTurnDrafts(previous => ({ ...previous, [sessionKey]: { caseId, message: testCase?.userInput || '' } }));
              }}
              message={multiTurnDrafts[activeMultiTurnSession?.key]?.message || ''}
              onMessageChange={value => {
                const sessionKey = activeMultiTurnSession?.key;
                if (sessionKey) setMultiTurnDrafts(previous => ({ ...previous, [sessionKey]: { caseId: '', message: value } }));
              }}
              onSend={handleRunMultiTurn}
              onGenerate={handleGenerateNextMultiTurnMessage}
              mode={multiTurnInputMode}
              onModeChange={setMultiTurnInputMode}
              onAutoRun={() => handleAutoMultiTurn(autoRunAllSessions ? multiTurnSessionList.map(session => session.key) : (activeMultiTurnSession ? [activeMultiTurnSession.key] : []))}
              autoTurnCount={autoTurnCount}
              onAutoTurnCountChange={value => setAutoTurnCount(Math.min(20, Math.max(1, parseInt(value) || 1)))}
              autoRunAllSessions={autoRunAllSessions}
              onAutoRunAllSessionsChange={setAutoRunAllSessions}
              onOpenAutoGenerationSettings={handleOpenAutoGenerationSettings}
              onReset={handleResetMultiTurnConversation}
              isGenerating={isGeneratingMultiTurnMessage}
              isRunning={manualIsRunning}
              canSend={Boolean(multiTurnDrafts[activeMultiTurnSession?.key]?.message?.trim())}
              canGenerate={Boolean(activeMultiTurnSession)}
              hasStarted={multiTurnHasConversation}
            />
            <AutoGenerationSettingsModal
              isOpen={isAutoGenerationSettingsOpen}
              settings={autoGenerationSettingsDraft || autoGenerationSettings}
              models={AVAILABLE_MODELS}
              responseStyles={AUTO_RESPONSE_STYLES}
              onChange={setAutoGenerationSettingsDraft}
              onClose={() => { setIsAutoGenerationSettingsOpen(false); setAutoGenerationSettingsDraft(null); }}
              onSave={handleSaveAutoGenerationSettings}
            />
            </>
          )}
        </>
        ) : activeMode === 'auto' ? (
          renderOptimizationWorkspace()
        ) : (
          /* Prompt Test Layout */
          <>
            <div className="top-panel" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
              {/* Column 1: Prompt Scenario Management (Sidebar Tree Directory) */}
              <div className="input-panel glass-panel scenario-sidebar" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '500px', backgroundColor: 'var(--surface-color)' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📁 Scenario Directory
                  </h3>
                  
                  {/* Scenario Search Input */}
                  <div style={{ position: 'relative', display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input 
                      type="text" 
                      placeholder="검색..." 
                      value={scenarioSearchQuery} 
                      onChange={(e) => setScenarioSearchQuery(e.target.value)} 
                      style={{ padding: '8px 12px 8px 32px', fontSize: '0.85rem', height: '36px', flex: 1, backgroundColor: '#111419' }}
                    />
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem', pointerEvents: 'none' }}>
                      🔍
                    </span>
                    {scenarioSearchQuery && (
                      <button 
                        onClick={() => setScenarioSearchQuery('')} 
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', padding: '4px' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* New Scenario Button */}
                  <button 
                    className="btn-primary" 
                    onClick={() => {
                      saveActiveScenarioState(activeGoldenSet, goldenSetPresetName);
                      setActiveGoldenSet({
                        id: 'default',
                        name: '새 프롬프트 시나리오',
                        activityName: '',
                        title: '',
                        memo: '',
                        context: '',
                        systemPrompt: '',
                        testCases: []
                      });
                      setPrompt('');
                      setGoldenSetPresetName('');
                      setCustomActivityName('');
                      setGoldenSetPresetActivity('Activity 1');
                      setSelectedGoldenCases([]);
                      setSelectedManualCases([]);
                      setGoldenSetResults([]);
                    }}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '16px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#a5b4fc' }}
                  >
                    ➕ New Scenario
                  </button>
                </div>

                {/* Tree Directory Section */}
                <div className="sidebar-tree" style={{ flex: 1, overflowY: 'auto', maxHeight: '420px', paddingRight: '4px', marginBottom: '16px' }}>
                  {(() => {
                    const grouped = goldenSets.reduce((acc, preset) => {
                      const act = preset.activityName?.trim() || 'General';
                      if (!acc[act]) acc[act] = [];
                      acc[act].push(preset);
                      return acc;
                    }, {});

                    const filteredGroups = {};
                    let hasAny = false;
                    Object.entries(grouped).forEach(([act, presets]) => {
                      const query = scenarioSearchQuery.toLowerCase();
                      const filtered = presets.filter(p => 
                        p.name.toLowerCase().includes(query) || 
                        (p.title || '').toLowerCase().includes(query) ||
                        act.toLowerCase().includes(query)
                      );
                      if (filtered.length > 0) {
                        filteredGroups[act] = filtered;
                        hasAny = true;
                      }
                    });

                    if (!hasAny) {
                      return (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          {goldenSets.length === 0 ? '저장된 시나리오가 없습니다.' : '검색 결과가 없습니다.'}
                        </div>
                      );
                    }

                    return Object.entries(filteredGroups).map(([act, presets]) => {
                      const isCollapsed = collapsedActivities[act];
                      return (
                        <div key={act} className="tree-group" style={{ marginBottom: '12px' }}>
                          <div 
                            className="tree-folder" 
                            onClick={() => setCollapsedActivities(prev => ({ ...prev, [act]: !prev[act] }))}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px', 
                              padding: '6px 8px', 
                              cursor: 'pointer', 
                              borderRadius: '6px',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              color: 'var(--text)',
                              backgroundColor: 'rgba(255, 255, 255, 0.02)',
                              transition: 'background-color 0.2s',
                              userSelect: 'none'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)'}
                          >
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>
                              ▼
                            </span>
                            <span style={{ fontSize: '1rem' }}>📁</span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '10px' }}>{presets.length}</span>
                          </div>
                          
                          {!isCollapsed && (
                            <div className="tree-children" style={{ paddingLeft: '16px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {presets.map(preset => {
                                const isActive = activeGoldenSet.id === preset.id;
                                return (
                                  <div 
                                    key={preset.id}
                                    className={`tree-node ${isActive ? 'tree-node-active' : ''}`}
                                    onClick={() => handleLoadGoldenPreset(preset)}
                                    style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'space-between',
                                      padding: '6px 8px', 
                                      cursor: 'pointer', 
                                      borderRadius: '6px',
                                      fontSize: '0.8rem',
                                      transition: 'all 0.2s',
                                      backgroundColor: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                                      borderLeft: isActive ? '3px solid var(--primary-color)' : '3px solid transparent',
                                      color: isActive ? 'var(--text-main)' : 'var(--text-muted)'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isActive) {
                                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                                        e.currentTarget.style.color = 'var(--text)';
                                      }
                                      const delBtn = e.currentTarget.querySelector('.tree-node-delete-btn');
                                      if (delBtn) delBtn.style.opacity = '1';
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isActive) {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.style.color = 'var(--text-muted)';
                                      }
                                      const delBtn = e.currentTarget.querySelector('.tree-node-delete-btn');
                                      if (delBtn) delBtn.style.opacity = '0';
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}>
                                      <span style={{ fontSize: '0.9rem' }}>📄</span>
                                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                        <span style={{ fontWeight: isActive ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {preset.title || '(제목 없음)'}
                                        </span>
                                        {preset.name && (
                                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {preset.name}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    
                                    <button 
                                      className="tree-node-delete-btn" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`'${preset.name}' 시나리오를 삭제하시겠습니까?`)) {
                                          handleDeleteGoldenPreset(preset.id);
                                        }
                                      }}
                                      title="시나리오 삭제"
                                      style={{ 
                                        background: 'transparent', 
                                        color: 'var(--error)', 
                                        border: 'none', 
                                        cursor: 'pointer', 
                                        padding: '2px', 
                                        opacity: 0, 
                                        transition: 'opacity 0.2s',
                                        display: 'flex',
                                        alignItems: 'center'
                                      }}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>

              </div>

              {/* Column 2: Prompt Details Config Panel */}
              <div className="input-panel glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: 'var(--surface-color)' }}>
                {/* Activity Select, Prompt Title & Scenario Name */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', width: '100%' }}>
                  <div style={{ width: '180px', flexShrink: 0 }} className="input-section">
                    <label htmlFor="prompt-activity" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Activity Name</label>
                    <select
                      id="prompt-activity"
                      value={
                        DEFAULT_ACTIVITIES.includes(activeGoldenSet.activityName) 
                          ? activeGoldenSet.activityName 
                          : (activeGoldenSet.activityName ? 'custom' : 'Book Quiz')
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setActiveGoldenSet(prev => ({ ...prev, activityName: 'Custom Activity' }));
                        } else {
                          setActiveGoldenSet(prev => ({ ...prev, activityName: val }));
                        }
                      }}
                      style={{ padding: '8px 12px', fontSize: '0.9rem', width: '100%', backgroundColor: '#111419', border: '1px solid var(--surface-border)', color: '#fff', borderRadius: '8px', height: '38px' }}
                    >
                      {DEFAULT_ACTIVITIES.map(act => (
                        <option key={act} value={act}>{act}</option>
                      ))}
                      <option value="custom">-- 직접 입력 (Custom) --</option>
                    </select>
                  </div>

                  {/* Custom Activity Input if custom chosen */}
                  {!DEFAULT_ACTIVITIES.includes(activeGoldenSet.activityName) && activeGoldenSet.activityName !== '' && (
                    <div style={{ width: '150px', flexShrink: 0 }} className="input-section">
                      <label htmlFor="prompt-activity-custom" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Custom Activity</label>
                      <input
                        type="text"
                        id="prompt-activity-custom"
                        placeholder="액티비티 이름 직접 입력"
                        value={activeGoldenSet.activityName}
                        onChange={(e) => setActiveGoldenSet(prev => ({ ...prev, activityName: e.target.value }))}
                        style={{ padding: '8px 12px', fontSize: '0.9rem', backgroundColor: '#111419', height: '38px', color: '#fff' }}
                      />
                    </div>
                  )}

                  <div style={{ flex: 1.2 }} className="input-section">
                    <label htmlFor="prompt-title" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Prompt Title</label>
                    <input 
                      type="text"
                      id="prompt-title"
                      placeholder="프롬프트 제목을 입력해 주세요"
                      value={activeGoldenSet.title || ''}
                      onChange={(e) => setActiveGoldenSet(prev => ({ ...prev, title: e.target.value }))}
                      style={{ padding: '8px 12px', fontSize: '0.9rem', backgroundColor: '#111419', height: '38px' }}
                    />
                  </div>

                  {/* Scenario Name (시나리오 이름은 Prompt Title 오른쪽으로 이동) */}
                  <div style={{ flex: 1 }} className="input-section">
                    <label htmlFor="golden-preset-name" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Scenario Name</label>
                    <input 
                      type="text"
                      id="golden-preset-name"
                      placeholder="시나리오 이름 입력"
                      value={goldenSetPresetName}
                      onChange={e => setGoldenSetPresetName(e.target.value)}
                      style={{ padding: '8px 12px', fontSize: '0.9rem', backgroundColor: '#111419', height: '38px' }}
                    />
                  </div>
                </div>

                {/* Sub-grid: 2 columns for System Prompt vs Variables */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
                  
                  {/* Left Column: System Prompt & Memo */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* System Prompt for Evaluation */}
                    <div className="input-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label htmlFor="golden-prompt" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>System Prompt for Evaluation</label>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Use {"{{variable}}"} for values</span>
                      </div>
                      <textarea 
                        id="golden-prompt"
                        rows={10}
                        placeholder="프롬프트 테스트를 수행할 시스템 프롬프트(시나리오 지침)를 입력해 주세요."
                        value={activeGoldenSet.systemPrompt}
                        onChange={(e) => handleSystemPromptChange(e.target.value)}
                        style={{ fontSize: '0.85rem', lineHeight: '1.4', backgroundColor: '#111419' }}
                      />
                    </div>

                    {/* Prompt Memo */}
                    <div className="input-section">
                      <label htmlFor="prompt-memo" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>프롬프트 메모</label>
                      <textarea 
                        id="prompt-memo"
                        rows={3}
                        placeholder="이 프롬프트의 기획 의도, 검토 사항 등 상세 메모를 적어주세요."
                        value={activeGoldenSet.memo || ''}
                        onChange={(e) => setActiveGoldenSet(prev => ({ ...prev, memo: e.target.value }))}
                        style={{ fontSize: '0.85rem', lineHeight: '1.4', backgroundColor: '#111419' }}
                      />
                    </div>
                  </div>

                  {/* Right Column: Variables & Presets */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '8px', border: '1px solid var(--surface-border)', minHeight: '100%' }}>
                    <div>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>Variable Mapping Management</h4>
                      {renderPresetSelector(activeGoldenSet.id)}
                      
                      <button
                        type="button"
                        onClick={() => setShowGoldenVariables(previous => !previous)}
                        aria-expanded={showGoldenVariables}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-main)', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem' }}
                      >
                        {showGoldenVariables ? '변수 입력 접기' : `변수 입력 보기 (${uniqueGoldenVariables.length}개)`}
                      </button>

                      {showGoldenVariables && (uniqueGoldenVariables.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic', margin: '10px 0' }}>
                          감지된 변수가 없습니다. 시스템 프롬프트에 {"{{변수명}}"}을 입력해 변수를 추가하세요.
                        </p>
                      ) : (
                        <div className="input-section variables-section" style={{ marginBottom: '12px' }}>
                          <div className="variables-grid" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                            {uniqueGoldenVariables.map(key => (
                              <div key={key} className="variable-input-row" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                                <span style={{ width: '90px', flexShrink: 0, fontSize: '0.8rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={key}>{key}</span>
                                <input 
                                  type="text" 
                                  value={focusedVariableKey === key ? (promptVariables[key] || '') : abbreviateVariableValue(promptVariables[key])}
                                  onFocus={() => setFocusedVariableKey(key)}
                                  onBlur={() => setFocusedVariableKey(null)}
                                  onChange={(e) => handleVariableChange(key, e.target.value)}
                                  placeholder={`Value for ${key}`}
                                  style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem', height: '32px', backgroundColor: '#111419' }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      <hr style={{ borderColor: 'var(--surface-border)', opacity: 0.3, margin: '16px 0' }} />

                      {/* Variable Presets */}
                      <div className="mapping-presets" style={{ display: 'none' }}>
                        <h4 style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }}>변수 값 프리셋 (Variable Presets)</h4>

                        <select
                          value={selectedPresetId}
                          onChange={(e) => {
                            const mapping = savedMappings.find(item => item.id === e.target.value);
                            if (mapping) handleLoadMapping(mapping);
                            else setSelectedPresetId('');
                          }}
                          style={{ width: '100%', marginBottom: '10px', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--surface-border)', backgroundColor: '#111419', color: 'var(--text)', fontSize: '0.8rem' }}
                        >
                          <option value="">프리셋 선택 안 함</option>
                          {savedMappings.map(mapping => (
                            <option key={mapping.id} value={mapping.id}>{mapping.name} · {formatVariablePresetSummary(mapping.variables)}</option>
                          ))}
                        </select>
                        
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                          <input 
                            type="text" 
                            placeholder="프리셋 이름" 
                            value={presetName}
                            onChange={e => setPresetName(e.target.value)}
                            style={{ flex: 1, padding: '6px', fontSize: '0.8rem', height: '32px', backgroundColor: '#111419' }}
                          />
                          <button 
                            className="btn-primary" 
                            onClick={() => handleSaveMapping(activeGoldenSet.id)}
                            disabled={!presetName.trim()}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', height: '32px' }}
                          >
                            저장
                          </button>
                        </div>

                        {savedMappings.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto', paddingRight: '4px' }}>
                            {savedMappings.map(mapping => (
                              <div key={mapping.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid rgba(255,255,255,0.03)' }}>
                                <div style={{ paddingRight: '8px', overflow: 'hidden', flex: 1 }}>
                                  <div style={{ fontWeight: 600, marginBottom: '2px', color: 'var(--text)' }}>{mapping.name}</div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                    {formatVariablePresetSummary(mapping.variables)}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button className="btn-icon" onClick={() => handleLoadMapping(mapping)} title="불러오기" style={{ padding: '2px' }}>
                                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                  </button>
                                  <button className="btn-icon" onClick={() => handleDeleteMapping(mapping.id)} title="삭제" style={{ color: 'var(--error)', padding: '2px' }}>
                                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>

                {/* AI Generator & Select Models at bottom */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '20px', alignItems: 'start', borderTop: '1px solid var(--surface-border)', paddingTop: '20px' }}>
                  
                  {/* AI Generator */}
                  <div style={{ display: 'none' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ✨ AI Auto-Generate Test Cases
                    </h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.4' }}>
                      입력된 시스템 프롬프트와 컨텍스트를 분석하여 4가지 유형(정상, 오류, 엣지, 안정성)의 테스트 발화를 자동으로 생성합니다.
                    </p>

                    <div className="input-section" style={{ marginBottom: '12px' }}>
                      <label htmlFor="prompt-context" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'none', marginBottom: '6px' }}>
                        정상 케이스 상황/질문 (테스트 셋 컨텍스트)
                      </label>
                      <textarea 
                        id="prompt-context"
                        rows={2}
                        placeholder="정상 케이스 생성 시 반영할 특정 미션, 상황, 질문 또는 대화 주제를 입력하세요."
                        value={activeGoldenSet.context || ''}
                        onChange={(e) => setActiveGoldenSet(prev => ({ ...prev, context: e.target.value }))}
                        style={{ fontSize: '0.8rem', padding: '8px', backgroundColor: '#111419' }}
                      />
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span>Count/Category:</span>
                        <select 
                          value={goldenSetGenCount}
                          onChange={e => setGoldenSetGenCount(parseInt(e.target.value))}
                          style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', fontSize: '0.75rem', color: '#fff' }}
                        >
                          <option value={1}>1 case</option>
                          <option value={2}>2 cases</option>
                          <option value={3}>3 cases</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span>Level:</span>
                        <select 
                          value={goldenSetGenLevel}
                          onChange={e => setGoldenSetGenLevel(e.target.value)}
                          style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', fontSize: '0.75rem', color: '#fff' }}
                        >
                          <option value="Beginner">Beginner</option>
                          <option value="Intermediate">Intermediate</option>
                          <option value="Advanced">Advanced</option>
                        </select>
                      </div>
                      <button 
                        className="btn-primary" 
                        onClick={handleGenerateGoldenSetAI}
                        disabled={goldenSetGenLoading || !activeGoldenSet.systemPrompt.trim()}
                        style={{ flex: 1, padding: '6px 12px', fontSize: '0.8rem', background: '#4f46e5', borderColor: '#4f46e5', height: '30px' }}
                      >
                        {goldenSetGenLoading ? 'Generating...' : '🪄 Generate with AI'}
                      </button>
                    </div>
                  </div>

                  {/* Models and Actions */}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="input-section" style={{ display: 'none', margin: 0 }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Select Models</label>
                      <div className="models-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                        {AVAILABLE_MODELS.map((model) => {
                          const isSelected = selectedModels.includes(model.id);
                          return (
                            <div key={model.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <label className={`model-checkbox-label ${isSelected ? 'selected' : ''}`} style={{ margin: 0, padding: '6px 10px', fontSize: '0.8rem' }}>
                                <input 
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleModel(model.id)}
                                />
                                <span>{model.name}</span>
                              </label>
                              <ModelConfigOptions model={model} config={isSelected ? modelConfigs[model.id] : null} onChange={(key, value) => setModelConfigs(prev => ({ ...prev, [model.id]: { ...prev[model.id], [key]: value } }))} />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="run-actions" style={{ marginTop: 'auto', display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button 
                        className="btn-primary" 
                        onClick={handleSaveGoldenPreset}
                        disabled={!goldenSetPresetName.trim()}
                        title="프롬프트, 변수, 테스트셋을 포함한 현재 시나리오 전체 저장"
                        style={{ padding: '10px 24px', fontSize: '0.9rem', backgroundColor: 'var(--surface-border)', border: '1px solid var(--surface-border)', color: '#fff' }}
                        onMouseEnter={(e) => {
                          if (goldenSetPresetName.trim()) {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--surface-border)';
                        }}
                      >
                        💾 {activeGoldenSet.id === 'default' ? 'Save Scenario' : 'Update Scenario'}
                      </button>

                    </div>
                  </div>

                </div>
              </div>
            </div>




            {/* Progress Bar */}
            {goldenSetProgress.total > 0 && (goldenSetIsRunning || goldenSetResults.length > 0) && (
              <div className="progress-container" style={{ marginTop: '20px' }}>
                <div className="progress-header">
                  <span>진행 상태: {goldenSetProgress.statusText}</span>
                  <span>{goldenSetProgress.current} / {goldenSetProgress.total} 작업 ({goldenSetProgress.percentage}%)</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${goldenSetProgress.percentage}%` }}></div>
                </div>
              </div>
            )}

            {/* Performance Analytics Dashboard */}
            {Object.keys(goldenModelAverages).length > 0 && (
              <div className="dashboard-panel glass-panel" style={{ padding: '20px', marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0 }}>프롬프트 테스트 모델 비교 대시보드</h3>
                  <button className="btn-primary" onClick={handleExportGoldenResultsExcel} style={{ padding: '6px 12px', fontSize: '0.9rem' }}>
                    📊 결과 내보내기 (Excel)
                  </button>
                </div>
                
                {/* Average Cards */}
                <div className="dashboard-cards" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {Object.entries(goldenModelAverages).map(([modelName, avg]) => (
                    <div key={modelName} className="dashboard-card" style={{ flex: '1 1 240px', backgroundColor: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                      <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text)' }}>{modelName}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                        <div style={{ fontSize: '2.2rem', fontWeight: '900', color: 'var(--primary)' }}>{avg.total}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ 10 avg ({avg.count} runs)</div>
                      </div>
                      
                      {/* Metric Breakdown */}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', borderBottom: '1px solid var(--surface-border)', paddingBottom: '8px', marginBottom: '8px' }}>
                        <div>Coherence: {avg.rule}</div>
                        <div>Relevance: {avg.relevance}</div>
                        <div>Safety: {avg.safety}</div>
                      </div>

                      {/* Category Breakdown list */}
                      <div style={{ fontSize: '0.75rem' }}>
                        <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--text)' }}>Category Performance (Avg):</strong>
                        {Object.entries(avg.categories).map(([cat, score]) => (
                          <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                            <span style={{ color: 'var(--text-muted)' }}>{cat}</span>
                            <span style={{ fontWeight: 600, color: parseFloat(score) >= 8 ? '#4ade80' : parseFloat(score) >= 5 ? '#fbbf24' : '#f87171' }}>{score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Detailed Comparison Matrix */}
                <div style={{ marginTop: '24px', borderTop: '1px solid var(--surface-border)', paddingTop: '20px' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#a5b4fc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📋 세부 테스트 케이스별 모델 비교 (Detailed Comparison Matrix)
                  </h4>
                  <div className="results-table-container" style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                    <table className="results-comparison-table" style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'var(--surface-color)', minWidth: `${800 + selectedModels.length * 300}px` }}>
                      <thead>
                        <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '2px solid var(--surface-border)' }}>
                          <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)', borderRight: '1px solid var(--surface-border)', width: '250px' }}>
                            User Input (문장)
                          </th>
                          <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)', borderRight: '1px solid var(--surface-border)', width: '150px' }}>
                            테스트 셋 분류
                          </th>
                          {selectedModels.map(modelId => {
                            const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId);
                            return (
                              <th key={modelId} style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-main)', borderRight: '1px solid var(--surface-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.95rem' }}>{modelInfo?.name}</span>
                                  <span className="model-badge" style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>{modelInfo?.provider}</span>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const checkedCases = activeGoldenSet.testCases.filter(c => selectedGoldenCases.includes(c.id));
                          
                          const badgeStyles = {
                            '정상 케이스': { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
                            '오류 케이스': { bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
                            '엣지 케이스': { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
                            '안정성 케이스': { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' }
                          };

                          return checkedCases.map(testCase => {
                            const cstyle = badgeStyles[testCase.category] || { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' };
                            
                            return (
                              <tr key={testCase.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                {/* Column 1: User Input Text */}
                                <td style={{ padding: '16px', verticalAlign: 'top', borderRight: '1px solid var(--surface-border)', backgroundColor: 'rgba(255,255,255,0.01)', width: '250px' }}>
                                  <div style={{ color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {testCase.userInput}
                                  </div>
                                  {testCase.description && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                                      {testCase.description}
                                    </div>
                                  )}
                                </td>

                                {/* Column 2: Category */}
                                <td style={{ padding: '16px', verticalAlign: 'top', borderRight: '1px solid var(--surface-border)', backgroundColor: 'rgba(255,255,255,0.01)', width: '150px' }}>
                                  <span style={{ 
                                    display: 'inline-block', 
                                    padding: '4px 8px', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 'bold', 
                                    backgroundColor: cstyle.bg, 
                                    color: cstyle.color 
                                  }}>
                                    {testCase.category}
                                  </span>
                                </td>

                                {/* Selected Model Columns */}
                                {selectedModels.map(modelId => {
                                  const r = goldenSetResults.find(res => res.caseId === testCase.id && res.modelId === modelId);
                                  const isCurrentlyRunning = goldenSetIsRunning && !r && 
                                    goldenSetProgress.statusText.includes(AVAILABLE_MODELS.find(m => m.id === modelId)?.name || '');

                                  return (
                                    <td key={modelId} style={{ padding: '16px', verticalAlign: 'top', borderRight: '1px solid var(--surface-border)', width: `${70 / selectedModels.length}%` }}>
                                      {r ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                          {/* Score table */}
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <table style={{ borderCollapse: 'collapse', fontSize: '0.7rem', textAlign: 'center', border: '1px solid var(--surface-border)', background: 'var(--surface-color)', borderRadius: '4px', overflow: 'hidden' }}>
                                              <thead>
                                                <tr style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                                                  <th style={{ padding: '2px 4px', border: '1px solid var(--surface-border)', fontWeight: 600 }}>일관</th>
                                                  <th style={{ padding: '2px 4px', border: '1px solid var(--surface-border)', fontWeight: 600 }}>관련</th>
                                                  <th style={{ padding: '2px 4px', border: '1px solid var(--surface-border)', fontWeight: 600 }}>안전</th>
                                                  <th style={{ padding: '2px 4px', border: '1px solid var(--surface-border)', fontWeight: 600, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--text-main)' }}>평균</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                <tr style={{ color: 'var(--text-main)' }}>
                                                  <td style={{ padding: '2px 4px', border: '1px solid var(--surface-border)' }}>{r.ruleScore}</td>
                                                  <td style={{ padding: '2px 4px', border: '1px solid var(--surface-border)' }}>{r.relevanceScore}</td>
                                                  <td style={{ padding: '2px 4px', border: '1px solid var(--surface-border)' }}>{r.safetyScore}</td>
                                                  <td style={{ padding: '2px 4px', border: '1px solid var(--surface-border)', fontWeight: 'bold', background: 'rgba(99, 102, 241, 0.05)', color: 'var(--primary-color)' }}>{r.totalScore}</td>
                                                </tr>
                                              </tbody>
                                            </table>

                                            <div className={`score-badge tooltip ${r.totalScore >= 8 ? 'good' : (r.totalScore >= 5 ? 'fair' : 'poor')}`} style={{ padding: '4px', borderRadius: '4px', cursor: 'help' }}>
                                              {r.totalScore >= 8 ? '🟢' : (r.totalScore >= 5 ? '🟡' : '🔴')}
                                              <span className="tooltiptext" style={{ minWidth: '240px', textAlign: 'left' }}>
                                                <strong>Judge Scores (상세 점수)</strong>
                                                <hr style={{ margin: '4px 0', borderColor: 'var(--surface-border)' }} />
                                                Coherence (일관성): {r.ruleScore} / 10
                                                {r.scores_breakdown?.coherence_breakdown && (
                                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', paddingLeft: '8px', marginBottom: '4px' }}>
                                                    • 포맷 및 구조: {r.scores_breakdown.coherence_breakdown.format_structure ?? '-'} / 4.0<br/>
                                                    • 문법 및 시제: {r.scores_breakdown.coherence_breakdown.grammar_tense ?? '-'} / 2.5<br/>
                                                    • 수량 제약: {r.scores_breakdown.coherence_breakdown.word_count ?? '-'} / 2.5<br/>
                                                    • 특정 단어: {r.scores_breakdown.coherence_breakdown.specific_words ?? '-'} / 1.0
                                                  </div>
                                                )}
                                                Relevance (관련성): {r.relevanceScore} / 10
                                                {r.scores_breakdown?.relevance_breakdown && (
                                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', paddingLeft: '8px', marginBottom: '4px' }}>
                                                    • 맥락 및 의도: {r.scores_breakdown.relevance_breakdown.context_intent ?? '-'} / 4.0<br/>
                                                    • 상호작용 및 흐름: {r.scores_breakdown.relevance_breakdown.flow_control ?? '-'} / 4.0<br/>
                                                    • 피드백 품질: {r.scores_breakdown.relevance_breakdown.feedback_quality ?? '-'} / 2.0
                                                  </div>
                                                )}
                                                Safety (제약 및 안전): {r.safetyScore} / 10
                                                {r.scores_breakdown?.safety_breakdown && (
                                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', paddingLeft: '8px', marginBottom: '4px' }}>
                                                    • 언어 수준 적절성: {r.scores_breakdown.safety_breakdown.language_leveling ?? '-'} / 5.0<br/>
                                                    • 기계적 답변 지양: {r.scores_breakdown.safety_breakdown.over_safety_avoidance ?? '-'} / 2.5<br/>
                                                    • 정서적 지지: {r.scores_breakdown.safety_breakdown.emotional_support ?? '-'} / 2.5
                                                  </div>
                                                )}
                                                <hr style={{ margin: '4px 0', borderColor: 'var(--surface-border)' }} />
                                                <em>{r.judgeFeedback}</em>
                                              </span>
                                            </div>
                                          </div>

                                          {/* Output Text */}
                                          <div style={{ 
                                            color: 'var(--text-main)', 
                                            fontSize: '0.85rem', 
                                            whiteSpace: 'pre-wrap', 
                                            lineHeight: '1.5', 
                                            backgroundColor: 'rgba(255,255,255,0.02)', 
                                            padding: '10px', 
                                            borderRadius: '6px', 
                                            border: '1px solid rgba(255,255,255,0.03)' 
                                          }}>
                                            {r.aiOutput}
                                          </div>

                                          {/* Collapsible Feedback */}
                                          <div className="evaluation-box" style={{ marginTop: '4px', padding: '8px', background: 'rgba(26, 29, 36, 0.4)', border: '1px solid var(--surface-border)', borderRadius: '6px' }}>
                                            <details style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                              <summary style={{ fontWeight: 'bold', outline: 'none', userSelect: 'none', cursor: 'pointer', color: 'var(--text-main)' }}>
                                                📊 상세 평가 피드백 (펼침/닫힘)
                                              </summary>
                                              <div style={{ marginTop: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.02)', lineHeight: '1.4', color: 'var(--text-muted)' }}>
                                                {r.judgeFeedback}
                                              </div>
                                            </details>
                                          </div>

                                          {/* Response Time */}
                                          {r.responseTimeMs > 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                              ⏱️ {(r.responseTimeMs / 1000).toFixed(2)}s
                                            </div>
                                          )}
                                        </div>
                                      ) : isCurrentlyRunning ? (
                                        <div className="loading-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '12px 0' }}>
                                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeLinecap="round" className="spinner-animation" />
                                          </svg>
                                          Generating/Evaluating...
                                        </div>
                                      ) : (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                          결과 없음 {goldenSetIsRunning ? '(대기 중)' : ''}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Test Case Table & Details */}
            {activeGoldenSet.id !== 'default' && (
              <>
                <div className="results-area" style={{ marginTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0 }}>테스트 케이스 목록 ({activeGoldenSet.testCases.length} Cases)</h3>
                    
                    {/* Batch Actions */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        className="btn-icon" 
                        onClick={() => setSelectedGoldenCases(activeGoldenSet.testCases.map(c => c.id))}
                        style={{ fontSize: '0.8rem', padding: '4px 8px', backgroundColor: 'var(--surface)' }}
                      >
                        Select All
                      </button>
                      <button 
                        className="btn-icon" 
                        onClick={() => setSelectedGoldenCases([])}
                        style={{ fontSize: '0.8rem', padding: '4px 8px', backgroundColor: 'var(--surface)' }}
                      >
                        Clear Selection
                      </button>
                      {activeGoldenSet.testCases.length > 0 && (
                        <button 
                          className="btn-icon" 
                          onClick={() => {
                            if (confirm("모든 테스트 케이스를 지우시겠습니까?")) {
                              setActiveGoldenSet(prev => ({ ...prev, testCases: [] }));
                              setSelectedGoldenCases([]);
                            }
                          }}
                          style={{ fontSize: '0.8rem', padding: '4px 8px', backgroundColor: 'var(--surface)', color: 'var(--error)' }}
                        >
                          Delete All
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="batch-table-container">
                    <table className="batch-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}><input type="checkbox" checked={activeGoldenSet.testCases.length > 0 && selectedGoldenCases.length === activeGoldenSet.testCases.length} onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedGoldenCases(activeGoldenSet.testCases.map(c => c.id));
                            } else {
                              setSelectedGoldenCases([]);
                            }
                          }} /></th>
                          <th style={{ width: '160px' }}>Category</th>
                          <th style={{ width: '400px' }}>User Input Text (학생 발화)</th>
                          <th style={{ width: '200px' }}>Reason/Explanation</th>
                          <th style={{ width: '150px' }}>Actions</th>
                          {selectedModels.length > 0 && <th>Evaluation Results per Model</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {activeGoldenSet.testCases.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                              등록된 테스트 케이스가 없습니다. 수동으로 등록하거나 AI 기능을 활용해 테스트 케이스를 생성해 주세요.
                            </td>
                          </tr>
                        ) : (
                          activeGoldenSet.testCases.map((testCase) => {
                            const isChecked = selectedGoldenCases.includes(testCase.id);
                            const caseResults = goldenSetResults.filter(r => r.caseId === testCase.id);

                            const badgeStyles = {
                              '정상 케이스': { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
                              '오류 케이스': { bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
                              '엣지 케이스': { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
                              '안정성 케이스': { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' }
                            };
                            const cstyle = badgeStyles[testCase.category] || { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' };

                            return (
                              <tr key={testCase.id}>
                                <td>
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked} 
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedGoldenCases(prev => [...prev, testCase.id]);
                                      } else {
                                        setSelectedGoldenCases(prev => prev.filter(id => id !== testCase.id));
                                      }
                                    }}
                                  />
                                </td>
                                <td>
                                  <span 
                                    style={{ 
                                      display: 'inline-block',
                                      padding: '4px 8px', 
                                      borderRadius: '4px', 
                                      fontSize: '0.75rem', 
                                      fontWeight: 'bold', 
                                      backgroundColor: cstyle.bg, 
                                      color: cstyle.color 
                                    }}
                                  >
                                    {testCase.category}
                                  </span>
                                </td>
                                <td>
                                  {editingGoldenCaseId === testCase.id ? (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      <textarea 
                                        style={{ flex: 1, padding: '4px', fontSize: '0.85rem' }} 
                                        value={editingGoldenCaseText} 
                                        onChange={e => setEditingGoldenCaseText(e.target.value)} 
                                      />
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <button className="btn-primary" onClick={handleSaveEditGoldenCase} style={{ padding: '2px 8px', fontSize: '0.75rem' }}>Save</button>
                                        <button className="btn-icon" onClick={() => setEditingGoldenCaseId(null)} style={{ padding: '2px 8px', fontSize: '0.75rem' }}>Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <pre style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', margin: 0 }}>{testCase.userInput}</pre>
                                  )}
                                </td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'normal', wordBreak: 'break-all' }}>
                                  {testCase.description}
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn-icon" onClick={() => handleStartEditGoldenCase(testCase.id, testCase.userInput)} title="Edit Case Text">
                                      ✏️
                                    </button>
                                    <button className="btn-icon" onClick={() => handleDeleteGoldenCase(testCase.id)} title="Delete Case" style={{ color: 'var(--error)' }}>
                                      🗑️
                                    </button>
                                  </div>
                                </td>
                                {selectedModels.length > 0 && (
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {caseResults.length === 0 ? (
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>결과 없음 (대기 중)</span>
                                      ) : (
                                        <>
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {caseResults.map(r => (
                                              <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '4px', border: '1px solid var(--surface-border)', minWidth: '130px' }}>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                                                  <span>{r.modelName}</span>
                                                  <span style={{ color: r.totalScore >= 8 ? '#4ade80' : r.totalScore >= 5 ? '#fbbf24' : '#f87171' }}>★ {r.totalScore}</span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                  C:{r.ruleScore} | R:{r.relevanceScore} | S:{r.safetyScore}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                          <button 
                                            onClick={() => setGoldenSetCompareCaseId(testCase.id)}
                                            style={{ alignSelf: 'flex-start', background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                                          >
                                            🔍 Model Side-by-Side Comparison
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <GoldenSetAIGenerator
                  activeGoldenSet={activeGoldenSet}
                  setActiveGoldenSet={setActiveGoldenSet}
                  count={goldenSetGenCount}
                  setCount={setGoldenSetGenCount}
                  level={goldenSetGenLevel}
                  setLevel={setGoldenSetGenLevel}
                  models={AVAILABLE_MODELS.filter(model => model.provider === 'Google')}
                  modelId={goldenSetGenModel}
                  setModelId={setGoldenSetGenModel}
                  loading={goldenSetGenLoading}
                  onGenerate={handleGenerateGoldenSetAI}
                />

                {/* Inline Manual Case Add Form */}
                <div className="glass-panel" style={{ marginTop: '12px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px dashed var(--surface-border)', borderRadius: '8px', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-main)' }}>➕ 수동 테스트 케이스 추가 (Add Manual Test Case)</h4>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>분류 (Category)</label>
                      <select 
                        value={manualNewCaseCategory} 
                        onChange={e => setManualNewCaseCategory(e.target.value)}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                      >
                        {TEST_CASE_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 2, minWidth: '250px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>학생 발화 (User Input)</label>
                      <input 
                        type="text" 
                        placeholder="테스트할 학생 발화를 입력하세요..." 
                        value={manualNewCaseInput}
                        onChange={e => setManualNewCaseInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleManualAddCase();
                          }
                        }}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                      />
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '150px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>설명/메모 (Description)</label>
                      <input 
                        type="text" 
                        placeholder="테스트 케이스 설명..." 
                        value={manualNewCaseDesc}
                        onChange={e => setManualNewCaseDesc(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleManualAddCase();
                          }
                        }}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                      />
                    </div>
                    
                    <button 
                      className="btn-primary" 
                      onClick={handleManualAddCase}
                      disabled={!manualNewCaseInput.trim()}
                      style={{ padding: '9px 18px', height: '38px' }}
                    >
                      추가
                    </button>
                  </div>
                </div>

                <div className="glass-panel" style={{ marginTop: '12px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px dashed var(--surface-border)', borderRadius: '8px', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-main)' }}>📋 테스트 케이스 표 입력</h4>
                  <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>표의 각 행을 직접 입력하거나 수정한 후 추가하세요. 첫 행의 학생 발화 칸에 여러 줄을 붙여 넣으면 행이 자동 추가됩니다. 형식: <strong>분류 [탭] 학생 발화 [탭] 설명</strong>.</p>
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--surface-border)', paddingTop: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <strong style={{ fontSize: '0.85rem' }}>케이스 입력 ({bulkCasePreview.length}행)</strong>
                        <button className="btn-icon" onClick={() => setBulkCasePreview(prev => [...prev, ...createBulkCaseRows(1)])} style={{ padding: '5px 9px', fontSize: '0.75rem' }}>행 추가</button>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="batch-table" style={{ minWidth: '700px' }}>
                          <thead><tr><th>분류</th><th>학생 발화</th><th>설명</th><th style={{ width: '52px' }}></th></tr></thead>
                          <tbody>
                            {bulkCasePreview.map(testCase => (
                              <tr key={testCase.id}>
                                <td><select value={testCase.category} onChange={e => setBulkCasePreview(prev => prev.map(item => item.id === testCase.id ? { ...item, category: e.target.value } : item))} style={{ minWidth: '130px', padding: '8px', borderRadius: '6px', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}>{TEST_CASE_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}</select></td>
                                <td><input value={testCase.userInput} onChange={e => setBulkCasePreview(prev => prev.map(item => item.id === testCase.id ? { ...item, userInput: e.target.value } : item))} onPaste={e => handleBulkCaseTablePaste(e, testCase.id)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }} /></td>
                                <td><input value={testCase.description} onChange={e => setBulkCasePreview(prev => prev.map(item => item.id === testCase.id ? { ...item, description: e.target.value } : item))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }} /></td>
                                <td><button className="btn-icon" title="행 삭제" onClick={() => setBulkCasePreview(prev => prev.filter(item => item.id !== testCase.id))} style={{ color: 'var(--error)' }}>🗑️</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button className="btn-primary" onClick={handleConfirmBulkGoldenCases} disabled={bulkCasePreview.length === 0} style={{ marginTop: '12px', padding: '8px 16px' }}>
                        편집한 {bulkCasePreview.length}개 케이스 추가
                      </button>
                    </div>
                </div>
              </>
            )}

            {/* Side-by-Side Model Comparison Modal */}
            {goldenSetCompareCaseId && (() => {
              const testCase = activeGoldenSet.testCases.find(c => c.id === goldenSetCompareCaseId);
              const caseResults = goldenSetResults.filter(r => r.caseId === goldenSetCompareCaseId);
              if (!testCase) return null;

              return (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                  <div className="glass-panel" style={{ width: '90%', maxWidth: '1200px', maxHeight: '90%', display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', overflowY: 'auto', border: '1px solid var(--surface-border)', color: 'var(--text)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--primary)' }}>
                        Model Side-by-Side Comparison
                      </h2>
                      <button 
                        onClick={() => setGoldenSetCompareCaseId(null)}
                        style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Test Case Input ({testCase.category}):</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{testCase.userInput}</div>
                      {testCase.description && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>설명: {testCase.description}</div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, caseResults.length)}, 1fr)`, gap: '16px', overflowX: 'auto', marginTop: '10px' }}>
                      {caseResults.length === 0 ? (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                          이 테스트 케이스에 대해 실행된 결과가 없습니다.
                        </div>
                      ) : (
                        caseResults.map(r => (
                          <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--surface-border)', paddingBottom: '8px' }}>
                              <span style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{r.modelName}</span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.thinkingLevel}</span>
                            </div>
                            
                            {/* Score table */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'center', border: '1px solid var(--surface-border)' }}>
                              <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                  <th style={{ padding: '4px', border: '1px solid var(--surface-border)' }}>일관성</th>
                                  <th style={{ padding: '4px', border: '1px solid var(--surface-border)' }}>관련성</th>
                                  <th style={{ padding: '4px', border: '1px solid var(--surface-border)' }}>안전성</th>
                                  <th style={{ padding: '4px', border: '1px solid var(--surface-border)', background: 'rgba(99,102,241,0.1)' }}>평균</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td style={{ padding: '4px', border: '1px solid var(--surface-border)' }}>{r.ruleScore}</td>
                                  <td style={{ padding: '4px', border: '1px solid var(--surface-border)' }}>{r.relevanceScore}</td>
                                  <td style={{ padding: '4px', border: '1px solid var(--surface-border)' }}>{r.safetyScore}</td>
                                  <td style={{ padding: '4px', border: '1px solid var(--surface-border)', fontWeight: 'bold', color: 'var(--primary-color)' }}>{r.totalScore}</td>
                                </tr>
                              </tbody>
                            </table>

                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>AI Response:</div>
                              <pre style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.02)', margin: 0, height: '140px', overflowY: 'auto' }}>
                                {r.aiOutput}
                              </pre>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.01)', fontSize: '0.8rem', color: 'var(--text-muted)', height: '100px', overflowY: 'auto' }}>
                              <strong>Judge Feedback:</strong><br/>
                              {r.judgeFeedback}
                            </div>
                            
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                              Response speed: {(r.responseTimeMs / 1000).toFixed(2)}s
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {showManualExportModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(0,0,0,0.75)' }}>
          <div className="glass-panel" role="dialog" aria-modal="true" aria-label="전체 결과 Excel 내보내기" style={{ width: 'min(520px, 100%)', display: 'flex', flexDirection: 'column', gap: '18px', padding: '24px', border: '1px solid var(--surface-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>전체 결과 Excel 내보내기</h3>
                <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>현재 실행된 모든 프리셋 결과를 하나의 파일에 포함합니다.</p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setShowManualExportModal(false)} aria-label="내보내기 모달 닫기">✕</button>
            </div>

            <div>
              <span style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}>포함할 정보</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                {[['model', '모델 선택 값'], ['preset', '프리셋 이름 값'], ['input', 'Input message 값']].map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px', border: '1px solid var(--surface-border)', borderRadius: '7px', color: 'var(--text-main)', fontSize: '0.78rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={manualExportFields[key]} onChange={event => setManualExportFields(previous => ({ ...previous, [key]: event.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <span style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}>출력 결과물 형식</span>
              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px', border: `1px solid ${manualExportOutputMode === 'full' ? 'var(--primary)' : 'var(--surface-border)'}`, borderRadius: '7px', cursor: 'pointer' }}>
                  <input type="radio" name="manual-export-output-mode" value="full" checked={manualExportOutputMode === 'full'} onChange={() => setManualExportOutputMode('full')} />
                  <span><strong style={{ display: 'block', fontSize: '0.84rem' }}>출력 결과물 그대로</strong><small style={{ color: 'var(--text-muted)' }}>응답 원문, 응답 회차, 사고 레벨 및 평가 정보까지 포함합니다.</small></span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px', border: `1px solid ${manualExportOutputMode === 'data-only' ? 'var(--primary)' : 'var(--surface-border)'}`, borderRadius: '7px', cursor: 'pointer' }}>
                  <input type="radio" name="manual-export-output-mode" value="data-only" checked={manualExportOutputMode === 'data-only'} onChange={() => setManualExportOutputMode('data-only')} />
                  <span><strong style={{ display: 'block', fontSize: '0.84rem' }}>결과물 데이터만 포함</strong><small style={{ color: 'var(--text-muted)' }}>JSON 응답은 키별 열과 순수값으로, 일반 응답은 결과 데이터 열에 원문만 포함합니다.</small></span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn-icon" onClick={() => setShowManualExportModal(false)}>취소</button>
              <button type="button" className="btn-primary" onClick={handleExportAllManualResults}>Excel 내보내기</button>
            </div>
          </div>
        </div>
      )}

      {addToGoldenCase && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1001, padding: '20px' }}>
          <div className="glass-panel" style={{ width: '95%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', border: '1px solid var(--surface-border)', color: 'var(--text)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--primary-color)' }}>
                🎯 프롬프트 테스트 케이스 추가 (Add to Prompt Test Case)
              </h3>
              <button 
                onClick={() => setAddToGoldenCase(null)}
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div className="input-section">
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>테스트 발화 (User Input)</label>
              <textarea
                rows={3}
                value={addToGoldenCase.userInput}
                onChange={e => setAddToGoldenCase(prev => ({ ...prev, userInput: e.target.value }))}
                style={{ fontSize: '0.9rem', padding: '10px' }}
                placeholder="테스트할 학생 발화를 입력하세요."
              />
            </div>

            <div className="input-section">
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>대상 프롬프트 시나리오 (Target Scenario)</label>
              <select
                value={addToGoldenCase.scenarioId || activeGoldenSet.id}
                onChange={e => setAddToGoldenCase(prev => ({ ...prev, scenarioId: e.target.value }))}
                style={{ padding: '8px', fontSize: '0.9rem', borderRadius: '6px', backgroundColor: 'var(--surface)', border: '1px solid var(--surface-border)', color: '#fff' }}
              >
                {activeGoldenSet.id === 'default' && (
                  <option value="default">-- 임시 프롬프트 테스트 (새 시나리오) --</option>
                )}
                {goldenSets.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.testCases?.length || 0} cases)
                  </option>
                ))}
              </select>
            </div>

            <div className="input-section">
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>테스트 케이스 분류 (Category)</label>
              <select
                value={addToGoldenCase.category || '정상 케이스'}
                onChange={e => setAddToGoldenCase(prev => ({ ...prev, category: e.target.value }))}
                style={{ padding: '8px', fontSize: '0.9rem', borderRadius: '6px', backgroundColor: 'var(--surface)', border: '1px solid var(--surface-border)', color: '#fff' }}
              >
                {TEST_CASE_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>

            <div className="input-section">
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>테스트 케이스 설명 (Description)</label>
              <input
                type="text"
                value={addToGoldenCase.description || ''}
                onChange={e => setAddToGoldenCase(prev => ({ ...prev, description: e.target.value }))}
                style={{ fontSize: '0.9rem', padding: '10px' }}
                placeholder="예: 과거 시제 오류를 유도하는 질문"
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button 
                className="btn-icon" 
                onClick={() => setAddToGoldenCase(null)}
                style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}
              >
                취소
              </button>
              <button 
                className="btn-primary" 
                onClick={() => handleSaveAddToGolden(addToGoldenCase.scenarioId || activeGoldenSet.id, addToGoldenCase.category || '정상 케이스', addToGoldenCase.userInput, addToGoldenCase.description)}
                disabled={!addToGoldenCase.userInput.trim()}
                style={{ padding: '8px 20px' }}
              >
                프롬프트 테스트에 추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
