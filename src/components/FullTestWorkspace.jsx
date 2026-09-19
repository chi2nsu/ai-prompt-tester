import { useMemo, useState } from 'react';

const resultStatus = result => result.error ? '오류' : result.evaluation?.passed === false ? '실패' : result.evaluation ? '통과' : '미평가';

export default function FullTestWorkspace({ plan, goldenSets, criteria, results, progress, isRunning, onOpenConfig, onRun, onStop, onExport }) {
  const [openActivities, setOpenActivities] = useState({});
  const [openResults, setOpenResults] = useState({});
  const scenarios = useMemo(() => Object.fromEntries(goldenSets.map(scenario => [scenario.id, scenario])), [goldenSets]);

  if (!plan || plan.prompts.length === 0) {
    return <div className="full-test-empty-state glass-panel"><span>FULL TEST</span><h2>전체 프롬프트 테스트를 구성하세요</h2><p>골든셋의 프롬프트와 검증 케이스를 선택하면 Activity별로 일괄 실행하고 비교할 수 있습니다.</p><button type="button" className="btn-primary" onClick={onOpenConfig}>테스트 프롬프트 추가</button></div>;
  }

  const selectedCriteria = criteria.filter(criterion => plan.criteriaIds.includes(criterion.id));
  const groupedPrompts = plan.prompts.reduce((groups, item) => {
    const scenario = scenarios[item.scenarioId];
    if (!scenario) return groups;
    const activity = scenario.activityName || '미분류';
    groups[activity] = [...(groups[activity] || []), { ...item, scenario }];
    return groups;
  }, {});
  const resultByPrompt = results.reduce((groups, result) => ({ ...groups, [result.scenarioId]: [...(groups[result.scenarioId] || []), result] }), {});
  const activityCount = Object.keys(groupedPrompts).length;
  const completed = results.length;
  const failed = results.filter(result => result.error || result.evaluation?.passed === false).length;
  const status = progress.total > 0 ? `${progress.current}/${progress.total}` : '대기 중';

  return <section className="full-test-workspace">
    <div className="full-test-summary glass-panel">
      <div><span>FULL TEST SUMMARY</span><h2>전체 테스트</h2><p>{activityCount}개 Activity · {plan.prompts.length}개 프롬프트 · AI 평가 {plan.aiEvaluation ? '포함' : '제외'}</p></div>
      <div className="full-test-summary-stats"><span><b>{progress.estimatedRequests || 0}</b> 예상 요청</span><span><b>{completed}</b> 완료</span><span><b>{failed}</b> 실패/오류</span><span><b>{progress.elapsedSeconds || 0}s</b> 소요</span></div>
      <div className="full-test-summary-actions"><button type="button" className="btn-icon" onClick={onOpenConfig} disabled={isRunning}>구성 편집</button>{isRunning ? <button type="button" className="btn-icon full-test-stop" onClick={onStop}>실행 중지</button> : <button type="button" className="btn-primary" onClick={onRun}>전체 테스트 실행</button>}{results.length > 0 && <button type="button" className="btn-icon" onClick={onExport}>Excel 내보내기</button>}</div>
      <div className="full-test-progress"><div><span>{status}</span><small>{progress.statusText || '실행 구성을 확인하세요.'}</small></div><progress value={progress.percentage || 0} max="100" /><b>{progress.percentage || 0}%</b></div>
      <div className="full-test-selected-criteria"><strong>검증 기준</strong>{selectedCriteria.map(criterion => <span key={criterion.id}>{criterion.name}{criterion.required ? ' · 필수' : ''}</span>)}</div>
    </div>

    <div className="full-test-activity-list">
      {Object.entries(groupedPrompts).map(([activity, items]) => {
        const isOpen = openActivities[activity] !== false;
        return <section className="full-test-activity-result glass-panel" key={activity}>
          <button type="button" className="full-test-activity-header" onClick={() => setOpenActivities(previous => ({ ...previous, [activity]: !isOpen }))}><span>{isOpen ? '⌄' : '›'}</span><strong>{activity}</strong><small>{items.length}개 프롬프트</small></button>
          {isOpen && <div className="full-test-prompt-results">{items.map(item => {
            const promptResults = resultByPrompt[item.scenarioId] || [];
            return <article className="full-test-prompt-result" key={item.scenarioId}>
              <div className="full-test-prompt-result-head"><div><strong>{item.scenario.title || item.scenario.name || '제목 없는 프롬프트'}</strong><small>{item.mode === 'multi' ? `멀티턴 · ${item.multiTurn.turnCount}턴 · ${item.multiTurn.modelId}` : `싱글턴 · 공통 모델 · ${plan.single.repeatCount}회 반복`}</small></div><span>{promptResults.length}개 결과</span></div>
              {promptResults.length === 0 ? <p className="full-test-no-results">아직 실행 결과가 없습니다.</p> : <div className="full-test-result-list">{promptResults.map(result => {
                const key = result.id;
                const isResultOpen = openResults[key];
                return <div className={`full-test-result-row status-${resultStatus(result)}`} key={key}>
                  <button type="button" onClick={() => setOpenResults(previous => ({ ...previous, [key]: !isResultOpen }))}><span>{isResultOpen ? '⌄' : '›'}</span><b>{resultStatus(result)}</b><span>[{result.caseCategory}] {result.caseInput}</span><small>{result.modelName} · {result.mode === 'multi' ? `${result.turns.length}턴` : `${result.repeatIndex}회차`}</small></button>
                  {isResultOpen && <div className="full-test-result-detail">{result.error ? <p className="full-test-error">{result.error}</p> : <>{result.turns.map((turn, index) => <div className="full-test-turn" key={turn.id || index}><strong>{result.mode === 'multi' ? `${index + 1}턴` : '응답'}</strong><p><small>입력</small>{turn.userInput}</p><p><small>응답</small>{turn.response}</p></div>)}{result.evaluation && <div className="full-test-evaluation"><strong>검증 결과 · {result.evaluation.passed ? '통과' : '실패'}</strong>{result.evaluation.criteria.map(criterion => <p key={criterion.id}><b>{criterion.passed ? '통과' : '실패'} · {criterion.name} ({criterion.score}/10)</b>{criterion.reason}</p>)}<small>{result.evaluation.summary}</small></div>}</>}</div>}
                </div>;
              })}</div>}
            </article>;
          })}</div>}
        </section>;
      })}
    </div>
  </section>;
}
