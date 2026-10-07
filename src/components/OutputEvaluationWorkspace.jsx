import { useEffect, useState } from 'react';
import { buildOutputEvaluationSystemPrompt } from '../utils/api';

const fieldStyle = { width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--surface-border)', background: '#111419', color: 'var(--text-main)' };
const scoreColor = (score) => score >= 4 ? '#22c55e' : score >= 3 ? '#f59e0b' : '#ef4444';

const getCandidateStatus = (evaluation, metrics) => {
  if (!evaluation) return { state: 'pending', label: 'None', reasons: [] };
  const activeMetricIds = new Set(metrics.filter(metric => metric.enabled).map(metric => metric.id));
  const lowMetrics = (evaluation.metrics || []).filter(metric => activeMetricIds.has(metric.id) && typeof metric.score === 'number' && metric.score < 4);
  const safetyFlags = Object.entries(evaluation.safetyFlags || {}).filter(([, value]) => value).map(([key]) => key);
  const jsonEnabled = activeMetricIds.has('json-stability');
  const jsonMetric = (evaluation.metrics || []).find(metric => metric.id === 'json-stability');
  const reasons = [
    ...lowMetrics.map(metric => metrics.find(item => item.id === metric.id)?.name || metric.id),
    ...(jsonEnabled && jsonMetric && jsonMetric.score !== null && !evaluation.jsonCheck?.valid ? ['JSON 형식'] : []),
    ...safetyFlags.map(flag => ({ profanityOrAbuse: '욕설·혐오', violenceOrSelfHarm: '폭력·자해', sexualContent: '성적 내용', harmfulContent: '유해 내용' }[flag] || flag)),
  ];
  return reasons.length > 0 ? { state: 'fail', label: 'Fail', reasons } : { state: 'pass', label: 'Pass', reasons: [] };
};

const statusStyle = (state) => ({
  color: state === 'pass' ? '#86efac' : state === 'fail' ? '#fca5a5' : 'var(--text-muted)',
  background: state === 'pass' ? 'rgba(34,197,94,.12)' : state === 'fail' ? 'rgba(239,68,68,.12)' : 'rgba(148,163,184,.1)',
  border: `1px solid ${state === 'pass' ? 'rgba(34,197,94,.3)' : state === 'fail' ? 'rgba(239,68,68,.3)' : 'rgba(148,163,184,.22)'}`,
  borderRadius: '999px', padding: '4px 8px', fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap',
});

function ScoreMeter({ evaluation, metrics }) {
  if (!evaluation) return <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>None</span>;

  const score = Number(evaluation.overallScore || 0);
  const formattedScore = score.toFixed(1);
  const filled = Math.max(0, Math.min(5, Math.round(score)));

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
      <div style={{ display: 'flex', gap: '3px' }} aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <span key={index} style={{ width: '18px', height: '10px', borderRadius: '2px', background: index < filled ? scoreColor(score) : 'rgba(148, 163, 184, 0.22)', border: `1px solid ${index < filled ? scoreColor(score) : 'rgba(148, 163, 184, 0.2)'}` }} />)}
      </div>
      <strong style={{ color: scoreColor(score), fontSize: '0.78rem' }}>{formattedScore}/5.0</strong>
    </div>
  );
}

const METRIC_CATEGORIES = [
  { id: 'english', name: '영어 학습 품질', description: '난이도, 자연스러움, 문법, 교육적 피드백' },
  { id: 'quality', name: '결과물 품질·안정성', description: '콘텐츠 적절성, 사실성, 형식·반복 안정성' },
  { id: 'safety', name: '안전·아동 적합성', description: '유해성, 개인정보, 편향, 과잉 차단' },
];

function MetricManagerModal({ metrics, cefrLevel, onClose, onSave, isRunning }) {
  const [draftMetrics, setDraftMetrics] = useState(() => metrics);
  const activeMetrics = draftMetrics.filter(metric => metric.enabled);
  const systemPrompt = buildOutputEvaluationSystemPrompt(activeMetrics, cefrLevel);
  const updateMetric = (id, updates) => setDraftMetrics(previous => previous.map(metric => metric.id === id ? { ...metric, ...updates } : metric));
  const deleteMetric = (id) => setDraftMetrics(previous => previous.length > 1 ? previous.filter(metric => metric.id !== id) : previous);
  const categoryNames = new Set(METRIC_CATEGORIES.map(category => category.name));
  const metricsForCategory = (categoryName) => draftMetrics.filter(metric => metric.category === categoryName || (!categoryNames.has(metric.category) && categoryName === '결과물 품질·안정성'));
  const toggleCategory = (categoryName, enabled) => setDraftMetrics(previous => previous.map(metric => (
    metric.category === categoryName || (!categoryNames.has(metric.category) && categoryName === '결과물 품질·안정성')
      ? { ...metric, enabled }
      : metric
  )));

  return (
    <div className="evaluation-metric-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="auto-generation-modal evaluation-metric-modal" role="dialog" aria-modal="true" aria-labelledby="metric-manager-title" onMouseDown={event => event.stopPropagation()}>
        <div className="auto-generation-modal-header">
          <div><span>OUTPUT EVALUATION</span><h3 id="metric-manager-title">평가 지표 관리</h3></div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="평가 지표 관리 닫기">✕</button>
        </div>
        <div className="evaluation-metric-modal-grid">
          <div className="evaluation-metric-modal-panel">
            <label className="auto-generation-prompt-field" style={{ marginTop: 0 }}>
              <span>전체 평가 시스템 프롬프트</span>
              <textarea rows={20} readOnly value={systemPrompt} aria-label="전체 평가 시스템 프롬프트" style={{ lineHeight: 1.45, fontSize: '0.76rem', color: '#cbd5e1' }} />
            </label>
            <p className="auto-generation-help"><code>{'{{evaluation_metrics}}'}</code> 변수에 오른쪽에서 체크한 활성 지표 {activeMetrics.length}개의 ID, 이름, 분류, 루브릭이 자동으로 삽입됩니다. 영어 난이도는 선택한 CEFR {cefrLevel} 기준으로 평가합니다.</p>
          </div>
          <div className="evaluation-metric-modal-panel">
            <div className="auto-generation-modal-header">
              <div><span>VARIABLE VALUE</span><h3 style={{ fontSize: '0.95rem' }}>평가 지표</h3></div>
            </div>
            <div className="evaluation-metric-list">
              {METRIC_CATEGORIES.map(category => {
                const categoryMetrics = metricsForCategory(category.name);
                const allEnabled = categoryMetrics.length > 0 && categoryMetrics.every(metric => metric.enabled);
                const someEnabled = categoryMetrics.some(metric => metric.enabled);
                return (
                  <details key={category.id} className="evaluation-metric-category" style={{ border: '1px solid var(--surface-border)', borderRadius: '8px', background: 'rgba(255,255,255,0.015)' }}>
                    <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px', padding: '12px', listStyle: 'none' }}>
                      <input
                        ref={node => { if (node) node.indeterminate = someEnabled && !allEnabled; }}
                        type="checkbox"
                        checked={allEnabled}
                        onChange={event => { event.stopPropagation(); toggleCategory(category.name, event.target.checked); }}
                        onClick={event => event.stopPropagation()}
                        disabled={isRunning || categoryMetrics.length === 0}
                        aria-label={`${category.name} 전체 평가 사용`}
                      />
                      <span style={{ display: 'grid', gap: '3px' }}><strong style={{ fontSize: '0.88rem' }}>{category.name}</strong><small style={{ color: 'var(--text-muted)', fontSize: '0.73rem' }}>{category.description} · {categoryMetrics.filter(metric => metric.enabled).length}/{categoryMetrics.length}개 사용</small></span>
                    </summary>
                    <div style={{ display: 'grid', gap: '8px', padding: '0 12px 12px' }}>
                      {categoryMetrics.map(metric => (
                        <details key={metric.id} className="evaluation-metric-detail" style={{ border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '10px 12px', background: 'rgba(0,0,0,0.1)' }}>
                          <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px', listStyle: 'none' }}>
                            <input type="checkbox" checked={metric.enabled} onChange={event => { event.stopPropagation(); updateMetric(metric.id, { enabled: event.target.checked }); }} onClick={event => event.stopPropagation()} disabled={isRunning} aria-label={`${metric.name} 평가 사용`} />
                            <strong style={{ fontSize: '0.84rem' }}>{metric.name}</strong>
                          </summary>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 132px auto', gap: '8px', marginTop: '12px', alignItems: 'start' }}>
                            <input value={metric.name} onChange={event => updateMetric(metric.id, { name: event.target.value })} aria-label={`${metric.name} 이름`} style={fieldStyle} disabled={isRunning} />
                            <select value={categoryNames.has(metric.category) ? metric.category : '결과물 품질·안정성'} onChange={event => updateMetric(metric.id, { category: event.target.value })} style={fieldStyle} disabled={isRunning}><option value="영어 학습 품질">영어 학습 품질</option><option value="결과물 품질·안정성">결과물 품질·안정성</option><option value="안전·아동 적합성">안전·아동 적합성</option></select>
                            <button className="btn-icon" type="button" onClick={() => deleteMetric(metric.id)} disabled={isRunning || draftMetrics.length === 1} title="지표 삭제">삭제</button>
                          </div>
                          <textarea value={metric.description} onChange={event => updateMetric(metric.id, { description: event.target.value })} aria-label={`${metric.name} 루브릭`} style={{ ...fieldStyle, marginTop: '8px', minHeight: '76px', resize: 'vertical' }} disabled={isRunning} />
                        </details>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </div>
        <div className="auto-generation-modal-actions"><button type="button" className="btn-icon" onClick={onClose}>취소</button><button type="button" className="btn-primary" onClick={() => onSave(draftMetrics)} disabled={isRunning}>저장</button></div>
      </section>
    </div>
  );
}

export default function OutputEvaluationWorkspace({ candidates, selectedCandidateIds, onToggleCandidate, onToggleAllCandidates, onLoadResults, onResetResults, models, judgeModelId, onJudgeModelChange, cefrLevel, onCefrLevelChange, metrics, onReplaceMetrics, evaluations, loadVersion, onRunEvaluation, isRunning, error }) {
  const [isMetricManagerOpen, setIsMetricManagerOpen] = useState(false);
  const [expandedPromptGroups, setExpandedPromptGroups] = useState({});
  const [groupStatusFilters, setGroupStatusFilters] = useState({});
  const [expandedCandidateEvaluationDetails, setExpandedCandidateEvaluationDetails] = useState({});
  useEffect(() => { setExpandedPromptGroups({}); setGroupStatusFilters({}); setExpandedCandidateEvaluationDetails({}); }, [loadVersion]);
  const selectedCount = selectedCandidateIds.length;
  const selectedAll = candidates.length > 0 && candidates.every(candidate => selectedCandidateIds.includes(candidate.id));
  const activeMetrics = metrics.filter(metric => metric.enabled);
  const promptGroups = candidates.reduce((groups, candidate) => {
    const key = candidate.promptTitle || '직접 입력';
    if (!groups[key]) groups[key] = { key, title: key, activityName: candidate.activityName || '—', candidates: [] };
    groups[key].candidates.push(candidate);
    return groups;
  }, {});

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <section className="glass-panel" style={{ padding: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div><h2 style={{ margin: 0, fontSize: '1.25rem' }}>Evaluation</h2><p style={{ margin: '7px 0 0', color: 'var(--text-muted)', fontSize: '0.86rem' }}>단건 결과와 멀티턴 세션 전체를 선택해 정량 점수와 근거 기반 정성 평가를 실행합니다.</p></div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" type="button" onClick={onLoadResults} disabled={isRunning}>테스트 결과 불러오기</button>
            <button className="btn-icon" type="button" onClick={onResetResults} disabled={isRunning || candidates.length === 0}>초기화</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) minmax(130px, 170px) minmax(145px, 180px)', gap: '12px', marginTop: '18px', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '7px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>평가 모델<select value={judgeModelId} onChange={event => onJudgeModelChange(event.target.value)} style={fieldStyle} disabled={isRunning}>{models.map(model => <option key={model.id} value={model.id}>{model.name} · {model.provider}</option>)}</select></label>
          <label style={{ display: 'grid', gap: '7px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>영어 레벨 기준<select value={cefrLevel} onChange={event => onCefrLevelChange(event.target.value)} style={fieldStyle} disabled={isRunning}>{['Pre-A1', 'A1', 'A2', 'B1', 'B2'].map(level => <option key={level} value={level}>{level}</option>)}</select></label>
          <div style={{ display: 'grid', gap: '7px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <span>평가 지표 관리</span>
            <button className="btn-icon evaluation-metric-settings-button" type="button" onClick={() => setIsMetricManagerOpen(true)} disabled={isRunning} title="평가 지표 설정" aria-label="평가 지표 설정">⚙ {activeMetrics.length}개 평가 지표</button>
          </div>
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}><div><h3 style={{ margin: 0 }}>평가 대상 결과물</h3><p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>불러온 단건 테스트 응답 중 필요한 결과만 선택하세요. 종합 점수에 마우스를 올리면 지표별 근거를 볼 수 있습니다.</p></div><button className="btn-primary" type="button" onClick={onRunEvaluation} disabled={isRunning || selectedCount === 0 || activeMetrics.length === 0}>{isRunning ? '평가 중...' : `선택한 ${selectedCount}개 평가`}</button></div>
        {error && <p style={{ margin: '14px 0 0', color: 'var(--error, #ef4444)', fontSize: '0.82rem' }}>{error}</p>}
        {candidates.length === 0 ? <div className="empty-state" style={{ marginTop: '16px', padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>단건 또는 멀티턴 테스트를 실행한 뒤 “테스트 결과 불러오기”를 선택해 주세요.</div> : (
          <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
            {Object.values(promptGroups).map(group => {
              const statuses = group.candidates.map(candidate => ({ candidate, evaluation: evaluations[candidate.id], ...getCandidateStatus(evaluations[candidate.id], metrics) }));
              const completed = statuses.filter(item => item.state !== 'pending');
              const failed = statuses.filter(item => item.state === 'fail');
              const passed = statuses.filter(item => item.state === 'pass');
              const groupState = failed.length > 0 ? 'fail' : completed.length !== statuses.length ? 'pending' : 'pass';
              const groupLabel = groupState === 'pending' ? (completed.length === 0 ? 'None' : '평가 중') : groupState === 'pass' ? 'Pass' : 'Fail';
              const average = completed.length ? (completed.reduce((sum, item) => sum + Number(item.evaluation.overallScore || 0), 0) / completed.length).toFixed(1) : null;
              const isExpanded = Boolean(expandedPromptGroups[group.key]);
              const statusFilter = groupStatusFilters[group.key];
              const visibleStatuses = statusFilter ? statuses.filter(item => item.state === statusFilter) : statuses;
              return <section key={group.key} style={{ border: '1px solid var(--surface-border)', borderRadius: '9px', overflow: 'hidden', background: 'rgba(255,255,255,.012)' }}>
                <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) auto auto', gap: '12px', alignItems: 'center' }}>
                  <button type="button" onClick={() => { setExpandedPromptGroups(previous => ({ ...previous, [group.key]: !previous[group.key] })); setGroupStatusFilters(previous => ({ ...previous, [group.key]: undefined })); }} style={{ border: 0, padding: 0, textAlign: 'left', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer' }}>
                    <span><strong style={{ fontSize: '0.9rem' }}>{isExpanded ? '▾' : '▸'} {group.title}</strong><small style={{ display: 'block', marginTop: '4px', color: 'var(--text-muted)' }}>{group.activityName} · 결과물 {group.candidates.length}개 · {completed.length}/{group.candidates.length}개 평가 완료{statusFilter ? ` · ${groupLabel}만 표시` : ''}</small></span>
                  </button>
                  <span style={{ color: average ? scoreColor(Number(average)) : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>{average ? `평균 ${average}/5.0` : '—'}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', justifyContent: 'flex-end' }}>{groupState === 'pending' ? <span style={statusStyle(groupState)}>{groupLabel}</span> : <button type="button" onClick={() => { setExpandedPromptGroups(previous => ({ ...previous, [group.key]: true })); setGroupStatusFilters(previous => ({ ...previous, [group.key]: groupState })); }} style={{ ...statusStyle(groupState), cursor: 'pointer' }}>{groupLabel}</button>}{(groupState === 'pass' || groupState === 'fail') && <small style={{ color: groupState === 'fail' ? '#fecaca' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>통과 {passed.length} · 실패 {failed.length}</small>}</div>
                </div>
                {isExpanded && <div style={{ overflowX: 'auto', borderTop: '1px solid var(--surface-border)' }}><table style={{ minWidth: '1500px', width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}><colgroup><col style={{ width: '44px' }} /><col style={{ width: '112px' }} /><col style={{ width: '112px' }} /><col style={{ width: '150px' }} /><col style={{ width: '230px' }} /><col style={{ width: '365px' }} /><col style={{ width: '320px' }} /></colgroup><thead><tr style={{ background: 'rgba(255,255,255,0.04)' }}><th style={{ padding: '10px' }}><input type="checkbox" checked={visibleStatuses.length > 0 && visibleStatuses.every(item => selectedCandidateIds.includes(item.candidate.id))} onChange={event => visibleStatuses.forEach(item => { const selected = selectedCandidateIds.includes(item.candidate.id); if (selected !== event.target.checked) onToggleCandidate(item.candidate.id); })} aria-label={`${group.title} 결과 전체 선택`} /></th>{['시나리오 명', '모델', '테스트 케이스', '테스트 입력', '결과물', '상태'].map(label => <th key={label} style={{ padding: '10px', textAlign: 'left', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{label}</th>)}</tr></thead><tbody>{visibleStatuses.map(item => {
                  const compactCell = { padding: '10px', fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
                  const { candidate, evaluation } = item;
                  const isEvaluationDetailOpen = Boolean(expandedCandidateEvaluationDetails[candidate.id]);
                  const failedMetrics = (evaluation?.metrics || []).filter(metric => typeof metric.score === 'number' && metric.score < 4);
                  const remainingReasons = item.reasons.filter(reason => !failedMetrics.some(metric => (metrics.find(itemMetric => itemMetric.id === metric.id)?.name || metric.id) === reason));
                  return <tr key={candidate.id} style={{ borderTop: '1px solid var(--surface-border)', verticalAlign: 'top' }}><td style={{ padding: '10px', textAlign: 'center' }}><input type="checkbox" checked={selectedCandidateIds.includes(candidate.id)} onChange={() => onToggleCandidate(candidate.id)} aria-label={`${candidate.modelName} 결과 선택`} /></td><td style={compactCell} title={candidate.scenarioName}>{candidate.scenarioName || '—'}</td><td style={compactCell} title={candidate.modelName}>{candidate.modelName}</td><td style={{ ...compactCell, maxWidth: '150px' }} title={candidate.testCase || candidate.category}>{candidate.testCase || candidate.category || '—'}</td><td style={{ padding: '10px', fontSize: '0.78rem', whiteSpace: 'pre-wrap' }}>{candidate.userInput || '—'}</td><td style={{ padding: '10px', fontSize: '0.78rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{candidate.evaluationUnit === 'session' ? <details><summary style={{ cursor: 'pointer', color: '#c7d2fe' }}>{candidate.turnCount}턴 전체 대화 보기</summary><div style={{ marginTop: '8px', whiteSpace: 'pre-wrap' }}>{candidate.conversationTranscript}</div></details> : candidate.outputText}</td><td style={{ padding: '10px', minWidth: '320px' }}><div style={{ display: 'grid', gap: '6px' }}><ScoreMeter evaluation={evaluation} metrics={metrics} />{item.state === 'pending' ? <span style={statusStyle(item.state)}>{item.label}</span> : <button type="button" onClick={() => setExpandedCandidateEvaluationDetails(previous => ({ ...previous, [candidate.id]: !previous[candidate.id] }))} style={{ ...statusStyle(item.state), cursor: 'pointer', justifySelf: 'start' }}>{item.label} {isEvaluationDetailOpen ? '▾' : '▸'}</button>}{item.state === 'fail' && isEvaluationDetailOpen && <div style={{ padding: '8px 9px', border: '1px solid rgba(239,68,68,.3)', borderRadius: '7px', background: 'rgba(239,68,68,.06)', color: '#fecaca', fontSize: '0.76rem', lineHeight: 1.5 }}>{failedMetrics.map(metric => <div key={metric.id}>• {metrics.find(itemMetric => itemMetric.id === metric.id)?.name || metric.id} {metric.score}/5 — {metric.reason || '기준 미달'}</div>)}{remainingReasons.map(reason => <div key={reason}>• {reason}</div>)}{evaluation?.summary && <div style={{ marginTop: '5px', color: '#fca5a5' }}>평가 요약: {evaluation.summary}</div>}</div>}{item.state === 'pass' && isEvaluationDetailOpen && <div style={{ padding: '8px 9px', border: '1px solid rgba(34,197,94,.3)', borderRadius: '7px', background: 'rgba(34,197,94,.06)', color: '#bbf7d0', fontSize: '0.76rem', lineHeight: 1.5 }}>{(evaluation?.metrics || []).map(metric => <div key={metric.id}>• {metrics.find(itemMetric => itemMetric.id === metric.id)?.name || metric.id} {metric.score === null ? 'N/A' : `${metric.score}/5`} — {metric.reason || '통과'}</div>)}{evaluation?.summary && <div style={{ marginTop: '5px', color: '#bbf7d0' }}>평가 요약: {evaluation.summary}</div>}</div>}</div></td></tr>;
                })}</tbody></table></div>}
              </section>;
            })}
          </div>
        )}
      </section>

      <details className="glass-panel" style={{ padding: '16px 22px' }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>평가 기준의 조사 근거</summary><ul style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.6 }}><li><a href="https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-companion-volume-and-its-language-versions" target="_blank" rel="noreferrer">CEFR Companion Volume</a>: 난이도·상호작용·언어 사용 수준의 기준</li><li><a href="https://aclanthology.org/2023.emnlp-main.153/" target="_blank" rel="noreferrer">G-Eval</a>: 명시적 루브릭과 근거를 사용하는 LLM 평가 방식</li><li><a href="https://proceedings.neurips.cc/paper_files/paper/2023/file/91f18a1287b398d378ef22505bf41832-Paper-Datasets_and_Benchmarks.pdf" target="_blank" rel="noreferrer">MT-Bench / Chatbot Arena</a>: 다중 턴·모델 심사의 편향을 고려한 평가 운영</li><li><a href="https://aclanthology.org/2020.findings-emnlp.301/" target="_blank" rel="noreferrer">RealToxicityPrompts</a>: 생성 결과의 독성·유해성 평가 필요성</li></ul></details>
      {isMetricManagerOpen && <MetricManagerModal metrics={metrics} cefrLevel={cefrLevel} onClose={() => setIsMetricManagerOpen(false)} onSave={(nextMetrics) => { onReplaceMetrics(nextMetrics); setIsMetricManagerOpen(false); }} isRunning={isRunning} />}
    </div>
  );
}
