import { useEffect, useMemo, useState } from 'react';
import ValidationCriteriaModal from './ValidationCriteriaModal';
import { CRITERIA_SCOPE_LABELS } from '../data/validationCriteria';

const createPromptConfig = scenario => ({
  scenarioId: scenario.id,
  mode: 'single',
  caseScope: 'all',
  caseIds: [],
  multiTurn: { modelId: 'gemini-3.5-flash-lite', turnCount: 3 },
});

export default function FullTestConfigModal({ isOpen, goldenSets, models, criteria, initialPlan, onSave, onClose, onCriteriaUpdate }) {
  const [draft, setDraft] = useState(initialPlan);
  const [isCriteriaOpen, setIsCriteriaOpen] = useState(false);
  const scenarios = useMemo(() => goldenSets.filter(set => set.id !== 'default' && set.systemPrompt?.trim()), [goldenSets]);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(initialPlan);
    setIsCriteriaOpen(false);
  }, [isOpen, initialPlan]);

  if (!isOpen) return null;

  const selectedIds = new Set(draft.prompts.map(item => item.scenarioId));
  const selectedCriteria = criteria.filter(criterion => draft.criteriaIds.includes(criterion.id));
  const selectedScenarios = scenarios.filter(scenario => selectedIds.has(scenario.id));
  const activities = [...new Set(scenarios.map(scenario => scenario.activityName || '미분류'))];

  const updateDraft = changes => setDraft(previous => ({ ...previous, ...changes }));
  const getPromptConfig = scenario => draft.prompts.find(item => item.scenarioId === scenario.id) || createPromptConfig(scenario);

  const toggleScenario = scenario => {
    setDraft(previous => {
      const exists = previous.prompts.some(item => item.scenarioId === scenario.id);
      return {
        ...previous,
        prompts: exists
          ? previous.prompts.filter(item => item.scenarioId !== scenario.id)
          : [...previous.prompts, createPromptConfig(scenario)],
      };
    });
  };

  const toggleActivity = activity => {
    const activityScenarios = scenarios.filter(scenario => (scenario.activityName || '미분류') === activity);
    const isAllSelected = activityScenarios.every(scenario => selectedIds.has(scenario.id));
    setDraft(previous => ({
      ...previous,
      prompts: isAllSelected
        ? previous.prompts.filter(item => !activityScenarios.some(scenario => scenario.id === item.scenarioId))
        : [...previous.prompts.filter(item => !activityScenarios.some(scenario => scenario.id === item.scenarioId)), ...activityScenarios.map(createPromptConfig)],
    }));
  };

  const updatePrompt = (scenarioId, changes) => setDraft(previous => ({
    ...previous,
    prompts: previous.prompts.map(item => item.scenarioId === scenarioId ? { ...item, ...changes } : item),
  }));

  const updateMultiTurn = (scenarioId, changes) => setDraft(previous => ({
    ...previous,
    prompts: previous.prompts.map(item => item.scenarioId === scenarioId ? { ...item, multiTurn: { ...item.multiTurn, ...changes } } : item),
  }));

  const toggleCase = (scenarioId, caseId) => {
    const config = getPromptConfig({ id: scenarioId });
    const caseIds = config.caseIds.includes(caseId) ? config.caseIds.filter(id => id !== caseId) : [...config.caseIds, caseId];
    updatePrompt(scenarioId, { caseScope: 'selected', caseIds });
  };

  const save = () => {
    if (draft.prompts.length === 0) return;
    onSave({ ...draft, id: draft.id || crypto.randomUUID(), updatedAt: Date.now() });
  };

  return (
    <>
      <div className="full-test-modal-backdrop" role="presentation">
        <section className="full-test-modal full-test-config-modal" role="dialog" aria-modal="true" aria-labelledby="full-test-config-title">
          <div className="full-test-modal-header">
            <div><span>FULL TEST CONFIGURATION</span><h2 id="full-test-config-title">전체 테스트 구성</h2></div>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="전체 테스트 구성 닫기">✕</button>
          </div>
          <p className="full-test-modal-description">싱글턴 설정은 모든 싱글턴 프롬프트에 공통으로 적용합니다. 멀티턴 프롬프트는 개별 모델과 턴 수를 설정합니다.</p>

          <div className="full-test-global-settings">
            <div className="full-test-setting-block">
              <span>싱글턴 공통 설정</span>
              <label>모델<select value={draft.single.modelId} onChange={event => updateDraft({ single: { ...draft.single, modelId: event.target.value } })}>{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
              <label>케이스당 반복<select value={draft.single.repeatCount} onChange={event => updateDraft({ single: { ...draft.single, repeatCount: Number(event.target.value) } })}>{[1, 2, 3, 5].map(count => <option key={count} value={count}>{count}회</option>)}</select></label>
            </div>
            <div className="full-test-setting-block">
              <span>AI 평가 전역 설정</span>
              <label className="full-test-switch"><input type="checkbox" checked={draft.aiEvaluation} onChange={event => updateDraft({ aiEvaluation: event.target.checked })} /><b>{draft.aiEvaluation ? 'AI 평가 포함' : 'AI 평가 제외'}</b></label>
              <button type="button" className="btn-icon full-test-criteria-button" onClick={() => setIsCriteriaOpen(true)}>검증 기준 선택 · 관리</button>
              <div className="full-test-criteria-chips">{selectedCriteria.length > 0 ? selectedCriteria.map(criterion => <span key={criterion.id} title={criterion.description}>{criterion.name} · {CRITERIA_SCOPE_LABELS[criterion.scope]}</span>) : <small>선택된 검증 기준이 없습니다.</small>}</div>
            </div>
          </div>

          <div className="full-test-selection-toolbar">
            <strong>테스트할 프롬프트</strong>
            <label><input type="checkbox" checked={scenarios.length > 0 && selectedScenarios.length === scenarios.length} onChange={() => setDraft(previous => ({ ...previous, prompts: selectedScenarios.length === scenarios.length ? [] : scenarios.map(createPromptConfig) }))} /> 전체 선택</label>
            <small>{selectedScenarios.length}개 프롬프트 선택</small>
          </div>

          <div className="full-test-scenario-list">
            {activities.map(activity => {
              const activityScenarios = scenarios.filter(scenario => (scenario.activityName || '미분류') === activity);
              const allActivitySelected = activityScenarios.length > 0 && activityScenarios.every(scenario => selectedIds.has(scenario.id));
              return <section className="full-test-activity-picker" key={activity}>
                <label className="full-test-activity-title"><input type="checkbox" checked={allActivitySelected} onChange={() => toggleActivity(activity)} /> <strong>{activity}</strong><span>{activityScenarios.length}개</span></label>
                {activityScenarios.map(scenario => {
                  const config = getPromptConfig(scenario);
                  const cases = scenario.testCases || [];
                  return <article className={`full-test-scenario-picker ${selectedIds.has(scenario.id) ? 'is-selected' : ''}`} key={scenario.id}>
                    <label className="full-test-scenario-title"><input type="checkbox" checked={selectedIds.has(scenario.id)} onChange={() => toggleScenario(scenario)} /><span><strong>{scenario.title || scenario.name || '제목 없는 프롬프트'}</strong><small>{cases.length}개 케이스</small></span></label>
                    {selectedIds.has(scenario.id) && <div className="full-test-scenario-options">
                      <label>방식<select value={config.mode} onChange={event => updatePrompt(scenario.id, { mode: event.target.value })}><option value="single">싱글턴</option><option value="multi">멀티턴</option></select></label>
                      <label>검증 케이스<select value={config.caseScope} onChange={event => updatePrompt(scenario.id, { caseScope: event.target.value, caseIds: event.target.value === 'selected' ? config.caseIds : [] })}><option value="all">전체 케이스</option><option value="error">오류 케이스만</option><option value="selected">직접 선택</option></select></label>
                      {config.mode === 'multi' && <><label>멀티턴 모델<select value={config.multiTurn.modelId} onChange={event => updateMultiTurn(scenario.id, { modelId: event.target.value })}>{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label><label>대화 턴 수<select value={config.multiTurn.turnCount} onChange={event => updateMultiTurn(scenario.id, { turnCount: Number(event.target.value) })}>{[2, 3, 5, 7, 10].map(count => <option key={count} value={count}>{count}턴</option>)}</select></label></>}
                      {config.caseScope === 'selected' && <div className="full-test-case-picker">{cases.map(testCase => <label key={testCase.id}><input type="checkbox" checked={config.caseIds.includes(testCase.id)} onChange={() => toggleCase(scenario.id, testCase.id)} /> <span>[{testCase.category}] {testCase.userInput}</span></label>)}</div>}
                    </div>}
                  </article>;
                })}
              </section>;
            })}
            {scenarios.length === 0 && <p className="full-test-empty-message">테스트셋 · 골든셋에 시스템 프롬프트가 저장된 시나리오가 없습니다.</p>}
          </div>

          <div className="full-test-modal-footer"><span>{draft.aiEvaluation ? 'AI 평가 포함' : 'AI 평가 제외'} · {selectedCriteria.length}개 검증 기준</span><div><button type="button" className="btn-icon" onClick={onClose}>취소</button><button type="button" className="btn-primary" disabled={draft.prompts.length === 0} onClick={save}>구성 저장</button></div></div>
        </section>
      </div>
      <ValidationCriteriaModal isOpen={isCriteriaOpen} criteria={criteria} selectedIds={draft.criteriaIds} onClose={() => setIsCriteriaOpen(false)} onSave={(nextCriteria, nextIds) => { onCriteriaUpdate(nextCriteria); updateDraft({ criteriaIds: nextIds }); setIsCriteriaOpen(false); }} />
    </>
  );
}
