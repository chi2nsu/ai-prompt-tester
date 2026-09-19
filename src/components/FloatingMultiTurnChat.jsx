export default function FloatingMultiTurnChat({
  isOpen,
  onToggle,
  onTestModeChange,
  models,
  selectedModelId,
  onModelChange,
  thinkingLevel,
  onThinkingLevelChange,
  isModelLocked,
  sessionCount,
  onSessionCountChange,
  isSessionCountLocked,
  sessions,
  activeSessionKey,
  onSessionChange,
  cases,
  selectedCaseId,
  onCaseChange,
  message,
  onMessageChange,
  onSend,
  onGenerate,
  mode,
  onModeChange,
  onAutoRun,
  autoTurnCount,
  onAutoTurnCountChange,
  autoRunAllSessions,
  onAutoRunAllSessionsChange,
  onOpenAutoGenerationSettings,
  onReset,
  isGenerating,
  isRunning,
  canSend,
  canGenerate,
  hasStarted,
}) {
  const activeSession = sessions.find(session => session.key === activeSessionKey) || sessions[0];
  const isAutoMode = mode === 'auto';
  const selectedModel = models.find(model => model.id === selectedModelId);
  const thinkingLevels = selectedModel?.thinkingLevels || ['none', 'minimal', 'low', 'medium', 'high'];
  const selectedThinkingLevel = thinkingLevels.includes(thinkingLevel) ? thinkingLevel : (selectedModel?.defaultThinkingLevel || 'none');

  return (
    <aside className={`multi-turn-float ${isOpen ? 'is-open' : ''}`} aria-label="멀티턴 대화 입력">
      {!isOpen && (
        <button type="button" className="multi-turn-float-trigger" onClick={onToggle}>
          <span aria-hidden="true">💬</span>
          {hasStarted ? '다음 메시지' : '대화 시작'}
        </button>
      )}

      {isOpen && (
        <div className="multi-turn-float-panel" onKeyDown={event => {
          if (isAutoMode && (event.ctrlKey || event.metaKey) && event.key === 'Enter' && !isRunning && activeSession) onAutoRun();
        }}>
          <div className="multi-turn-float-header">
            <div className="multi-turn-float-header-left">
              <div>
              <span className="multi-turn-float-kicker">MULTI-TURN</span>
              <strong>{activeSession?.turns.length ? '다음 메시지 보내기' : '첫 메시지 보내기'}</strong>
              </div>
              <div className="multi-turn-mode-toggle" role="group" aria-label="테스트 방식 전환">
                <button type="button" onClick={() => onTestModeChange('single')} disabled={isRunning}>싱글턴</button>
                <button type="button" className="is-active">멀티턴</button>
              </div>
              <div className="multi-turn-mode-toggle" role="group" aria-label="진행 방식">
                <button type="button" className={mode === 'manual' ? 'is-active' : ''} onClick={() => onModeChange('manual')} disabled={isRunning}>직접 진행</button>
                <button type="button" className={isAutoMode ? 'is-active' : ''} onClick={() => onModeChange('auto')} disabled={isRunning}>AI 자동 진행</button>
              </div>
            </div>
            <div className="multi-turn-float-header-right">
              <div className="multi-turn-float-header-actions">
                {!isAutoMode && <button type="button" className="btn-icon multi-turn-generate-button" onClick={onGenerate} disabled={!canGenerate || isGenerating || isRunning}>{isGenerating ? '생성 중...' : '✨ AI 메시지 생성'}</button>}
                <button type="button" className="btn-icon multi-turn-reset-button" onClick={onReset} disabled={isGenerating || isRunning}>전체 초기화</button>
                <button type="button" className="btn-icon" onClick={onToggle} aria-label="대화창 접기">✕</button>
              </div>
            </div>
          </div>

          <div className="multi-turn-float-compose">
            <label className="multi-turn-float-session">
              <span>모델 선택</span>
              <select value={selectedModelId || ''} onChange={event => onModelChange(event.target.value)} disabled={isModelLocked || isRunning}>
                {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
            </label>
            {selectedModel?.provider === 'Google' && <label className="multi-turn-float-session-count">
              <span>Thinking level</span>
              <select value={selectedThinkingLevel} onChange={event => onThinkingLevelChange(event.target.value)} disabled={isModelLocked || isRunning}>
                {thinkingLevels.map(level => <option key={level} value={level}>{level}</option>)}
              </select>
            </label>}
            <label className="multi-turn-float-session-count">
              <span>세션 진행 수</span>
              <select value={sessionCount} onChange={event => onSessionCountChange(event.target.value)} disabled={isSessionCountLocked || isRunning}>
                {Array.from({ length: 10 }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count}개</option>)}
              </select>
            </label>
            <label className="multi-turn-float-session">
              <span>세션 선택</span>
              <select value={activeSession?.key || ''} onChange={event => onSessionChange(event.target.value)}>
                {sessions.map(session => <option key={session.key} value={session.key}>{session.modelName} · 세션 {session.sessionIndex + 1}</option>)}
              </select>
            </label>
            {!isAutoMode && cases.length > 0 && <label className="multi-turn-float-case">
              <span>테스트 케이스</span>
              <select value={selectedCaseId} onChange={event => onCaseChange(event.target.value)}>
                <option value="">직접 입력하기</option>
                {cases.map(testCase => <option key={testCase.id} value={testCase.id}>[{testCase.category}] {testCase.userInput}</option>)}
              </select>
            </label>}
            {!isAutoMode ? (
              <>
                <label className="multi-turn-float-message">
                  <span>메시지 입력</span>
                  <textarea className="multi-turn-float-input" rows={2} placeholder="선택한 세션에만 보낼 메시지를 입력하세요." value={message} onChange={event => onMessageChange(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && canSend && !isRunning) onSend(); }} />
                </label>
                <div className="multi-turn-float-actions"><span>Ctrl + Enter</span><button type="button" className="btn-primary" onClick={onSend} disabled={!canSend || isRunning}>{isRunning ? '생성 중...' : '보내기'}</button></div>
              </>
            ) : (
              <>
                <label className="multi-turn-auto-turns">
                  <span>AI 자동 진행 턴 수</span>
                  <input type="number" min="1" max="20" value={autoTurnCount} onChange={event => onAutoTurnCountChange(event.target.value)} disabled={isRunning} />
                </label>
                <label className="multi-turn-auto-all"><input type="checkbox" checked={autoRunAllSessions} onChange={event => onAutoRunAllSessionsChange(event.target.checked)} disabled={isRunning} /><span>모든 세션 자동 진행</span></label>
                <button type="button" className="btn-icon multi-turn-auto-settings-button" onClick={onOpenAutoGenerationSettings} disabled={isRunning}>⚙ 생성 설정</button>
                <div className="multi-turn-float-actions"><span>Ctrl + Enter</span><button type="button" className="btn-primary" onClick={onAutoRun} disabled={isRunning || !activeSession}>{isRunning ? '실행 중...' : (!activeSession?.turns.length && !autoRunAllSessions ? '첫 세션 실행' : '실행')}</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
