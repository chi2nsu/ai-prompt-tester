import { useState } from 'react';
import ModelConfigOptions from './ModelConfigOptions';

export default function FloatingSingleTurnRunner({
  isOpen,
  onToggle,
  onTestModeChange,
  onReset,
  models,
  selectedModelId,
  onModelChange,
  modelConfig,
  onModelConfigChange,
  resultCount,
  onResultCountChange,
  presets,
  selectedPresetId,
  onPresetChange,
  selectedMultiPresetIds,
  onMultiPresetToggle,
  onSetAllMultiPresets,
  message,
  onMessageChange,
  onRun,
  isRunning,
  canRun,
}) {
  const [isModelSettingsOpen, setIsModelSettingsOpen] = useState(false);
  const selectedModel = models.find(model => model.id === selectedModelId);

  return (
    <aside className={`multi-turn-float single-turn-float ${isOpen ? 'is-open' : ''}`} aria-label="단건 평가 실행">
      {!isOpen && <button type="button" className="multi-turn-float-trigger" onClick={onToggle}><span aria-hidden="true">💬</span> 평가 실행</button>}
      {isOpen && <div className="multi-turn-float-panel" onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && canRun && !isRunning) onRun();
        }}>
          <div className="multi-turn-float-header">
            <div className="multi-turn-float-header-left"><div><span className="multi-turn-float-kicker">SINGLE-TURN</span><strong>평가 실행</strong></div><div className="multi-turn-mode-toggle" role="group" aria-label="테스트 방식 전환"><button type="button" className="is-active">싱글턴</button><button type="button" onClick={() => onTestModeChange('multi')} disabled={isRunning}>멀티턴</button></div></div>
            <div className="multi-turn-float-header-actions"><button type="button" className="btn-icon multi-turn-reset-button" onClick={onReset} disabled={isRunning}>전체 초기화</button><button type="button" className="btn-icon" onClick={onToggle} aria-label="평가창 접기">✕</button></div>
          </div>
          <div className="multi-turn-float-compose">
            <div className="single-turn-runner-options">
              <div className="single-turn-model-control">
                <label className="multi-turn-float-session">
                  <span>모델 선택</span>
                  <select value={selectedModelId || ''} onChange={event => { onModelChange(event.target.value); setIsModelSettingsOpen(false); }} disabled={isRunning}>
                    {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                  </select>
                </label>
                <button type="button" className="btn-icon single-turn-model-settings-button" onClick={() => setIsModelSettingsOpen(previous => !previous)} disabled={isRunning} aria-expanded={isModelSettingsOpen} aria-label="모델 전송 설정" title="모델 전송 설정">⚙</button>
                {isModelSettingsOpen && selectedModel && <div className="single-turn-model-settings-panel" role="dialog" aria-label={`${selectedModel.name} 전송 설정`}>
                  <div className="single-turn-model-settings-header"><strong>{selectedModel.name} 전송 설정</strong><button type="button" className="btn-icon" onClick={() => setIsModelSettingsOpen(false)} aria-label="모델 설정 닫기">✕</button></div>
                  <ModelConfigOptions model={selectedModel} config={modelConfig} onChange={onModelConfigChange} disabled={isRunning} />
                </div>}
              </div>
              <label className="multi-turn-float-session-count">
                <span>모델 진행 수</span>
                <select value={resultCount} onChange={event => onResultCountChange(Number(event.target.value))} disabled={isRunning}>
                  {[1, 2, 3, 5, 10].map(count => <option key={count} value={count}>{count}개</option>)}
                </select>
              </label>
            </div>
            <div className="single-turn-preset-controls">
              <div className="single-turn-preset-selector">
                <label className="multi-turn-float-case">
                  <span>변수 프리셋 선택</span>
                  <select value={selectedPresetId} onChange={event => onPresetChange(event.target.value)} disabled={isRunning}>
                    <option value="">프리셋 선택 안 함</option>
                    {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                  </select>
                </label>
                <label className="single-turn-select-all-presets">
                  <input type="checkbox" checked={presets.length > 0 && presets.every(preset => selectedMultiPresetIds.includes(preset.id))} onChange={event => onSetAllMultiPresets(event.target.checked)} disabled={isRunning || presets.length === 0} />
                  전체 프리셋 선택
                </label>
              </div>
              <div className="single-turn-multi-presets">
                <span>여러 프리셋 비교</span>
                <div className="single-turn-multi-preset-list">
                  {presets.length === 0 ? <p>선택할 프리셋이 없습니다.</p> : presets.map(preset => <label key={preset.id}>
                    <input type="checkbox" checked={selectedMultiPresetIds.includes(preset.id)} onChange={() => onMultiPresetToggle(preset.id)} disabled={isRunning} />
                    <span>{preset.name}</span>
                  </label>)}
                </div>
              </div>
            </div>
            <label className="multi-turn-float-message">
              <span>메시지 입력</span>
              <textarea className="multi-turn-float-input" rows={3} placeholder="비워두면 시스템 프롬프트와 변수만 전송합니다." value={message} onChange={event => onMessageChange(event.target.value)} />
            </label>
            <div className="multi-turn-float-actions"><span>Ctrl + Enter</span><button type="button" className="btn-primary" onClick={onRun} disabled={!canRun || isRunning}>{isRunning ? '응답 생성 중...' : '평가 실행'}</button></div>
          </div>
      </div>
      }
    </aside>
  );
}
