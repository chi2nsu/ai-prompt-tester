import { useState } from 'react';

const LEVELS = ['Beginner', 'Intermediate', 'Advance'];
const WORD_COUNT_OPTIONS = [5, 10, 12, 15, 20, 30, 50, 100];

const getVariables = (...templates) => [...new Set(templates
  .flatMap(template => [...String(template || '').matchAll(/{{\s*([^}]+?)\s*}}/g)].map(match => match[1].trim()))
  .filter(Boolean))];

export default function AutoGenerationSettingsModal({ isOpen, settings, models, responseStyles, onChange, onClose, onSave }) {
  const [newVariableName, setNewVariableName] = useState('');
  if (!isOpen) return null;

  const customPrompts = settings.customPrompts || [];
  const selectedCustomPrompt = customPrompts.find(prompt => prompt.id === settings.selectedCustomPromptId);
  const activePrompt = settings.prompts[settings.level] || settings.prompts.Beginner || '';
  const customCommonPrompt = selectedCustomPrompt?.commonPrompt ?? settings.commonPrompt ?? '';
  const customVariables = selectedCustomPrompt?.variables || settings.variables || {};
  const variableNames = [...new Set([...Object.keys(customVariables), ...getVariables(customCommonPrompt)])];

  const updatePrompt = (value) => onChange({
    ...settings,
    prompts: { ...settings.prompts, [settings.level]: value },
  });

  const updateCustomPrompt = (changes) => {
    if (!selectedCustomPrompt) return;
    onChange({
      ...settings,
      customPrompts: customPrompts.map(prompt => prompt.id === selectedCustomPrompt.id ? { ...prompt, ...changes } : prompt),
    });
  };

  const addCustomPrompt = () => {
    const id = crypto.randomUUID();
    onChange({
      ...settings,
      level: 'Custom',
      selectedCustomPromptId: id,
      customPrompts: [...customPrompts, { id, name: `Custom ${customPrompts.length + 1}`, commonPrompt: settings.commonPrompt || '', variables: { ...(settings.variables || {}) } }],
    });
  };

  const removeCustomPrompt = () => {
    if (!selectedCustomPrompt) return;
    const remaining = customPrompts.filter(prompt => prompt.id !== selectedCustomPrompt.id);
    onChange({ ...settings, customPrompts: remaining, selectedCustomPromptId: remaining[0]?.id || '' });
  };

  const addVariable = () => {
    const name = newVariableName.trim();
    if (!name || customVariables[name] !== undefined || !selectedCustomPrompt) return;
    updateCustomPrompt({ variables: { ...customVariables, [name]: '' } });
    setNewVariableName('');
  };

  const removeVariable = (name) => {
    const variables = { ...customVariables };
    delete variables[name];
    updateCustomPrompt({ variables });
  };

  return (
    <div className="auto-generation-modal-backdrop" role="presentation">
      <section className="auto-generation-modal" role="dialog" aria-modal="true" aria-labelledby="auto-generation-settings-title">
        <div className="auto-generation-modal-header">
          <div><span>AI AUTO PROGRESSION</span><h3 id="auto-generation-settings-title">유저 메시지 생성 설정</h3></div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="설정 닫기">✕</button>
        </div>

        <label className="auto-generation-model-field">
          <span>유저 메시지 생성 모델</span>
          <select value={settings.modelId} onChange={event => onChange({ ...settings, modelId: event.target.value })}>
            {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>

        <div className="auto-generation-options-row">
          <label>
            <span>대화 상대</span>
            <select value={settings.conversationPartner || 'character'} onChange={event => onChange({ ...settings, conversationPartner: event.target.value })}>
              <option value="character">Character</option>
              <option value="tutor">Tutor</option>
            </select>
          </label>
          <label>
            <span>유저 메시지 최대 단어 수</span>
            <select value={settings.wordCount || 12} onChange={event => onChange({ ...settings, wordCount: Number(event.target.value) })}>
              {WORD_COUNT_OPTIONS.map(count => <option key={count} value={count}>{count} words</option>)}
            </select>
          </label>
        </div>

        <div className="auto-generation-mode-tabs" role="tablist" aria-label="프롬프트 방식 선택">
          <button type="button" role="tab" aria-selected={(settings.promptMode || 'default') === 'default'} className={(settings.promptMode || 'default') === 'default' ? 'is-active' : ''} onClick={() => onChange({ ...settings, promptMode: 'default' })}>Default</button>
          <button type="button" role="tab" aria-selected={settings.promptMode === 'custom'} className={settings.promptMode === 'custom' ? 'is-active' : ''} onClick={() => onChange({ ...settings, promptMode: 'custom' })}>Custom</button>
        </div>

        {(settings.promptMode || 'default') === 'default' ? <>
          <div className="auto-generation-level-tabs" role="tablist" aria-label="유저 레벨 선택">
            {LEVELS.map(level => <button key={level} type="button" role="tab" aria-selected={settings.level === level} className={settings.level === level ? 'is-active' : ''} onClick={() => onChange({ ...settings, level })}>{level}</button>)}
          </div>
          <div className="auto-generation-style-field">
            <span>대화 응답 스타일</span>
            <div className="auto-generation-style-chips" role="group" aria-label="대화 응답 스타일 선택">
              {responseStyles.map(style => <button key={style.id} type="button" className={settings.responseStyle === style.id ? 'is-active' : ''} onClick={() => onChange({ ...settings, responseStyle: style.id })} title={style.detail}>{style.label}</button>)}
            </div>
            {(() => {
              const selectedStyle = responseStyles.find(style => style.id === settings.responseStyle);
              return <div className="auto-generation-style-preview"><strong>{selectedStyle?.detail}</strong><span>프롬프트에 추가되는 지침</span><pre>{selectedStyle?.prompt}</pre></div>;
            })()}
          </div>
          <label className="auto-generation-prompt-field">
            <span>{settings.level} 유저 메시지 생성 프롬프트</span>
            <textarea rows={8} value={activePrompt} onChange={event => updatePrompt(event.target.value)} placeholder="유저 메시지를 생성할 프롬프트를 입력하세요." />
          </label>
          <p className="auto-generation-help">레벨과 응답 스타일을 빠르게 조합해 자동 진행합니다.</p>
        </> : <>
          <div className="auto-generation-custom-row">
            <label>
              <span>Custom 버전</span>
              <select value={settings.selectedCustomPromptId || ''} onChange={event => onChange({ ...settings, selectedCustomPromptId: event.target.value })}>
                {customPrompts.length === 0 && <option value="">Custom 버전을 추가하세요</option>}
                {customPrompts.map(prompt => <option key={prompt.id} value={prompt.id}>{prompt.name || '이름 없는 Custom'}</option>)}
              </select>
            </label>
            <button type="button" className="btn-icon" onClick={addCustomPrompt}>+ Custom 추가</button>
            {selectedCustomPrompt && <button type="button" className="btn-icon" onClick={removeCustomPrompt}>삭제</button>}
          </div>
          {selectedCustomPrompt && <label className="auto-generation-prompt-field">
            <span>Custom 버전 이름</span>
            <input type="text" value={selectedCustomPrompt.name} onChange={event => updateCustomPrompt({ name: event.target.value })} placeholder="예: 인사하기 오류 반응" />
          </label>}
          <div className="auto-generation-custom-grid">
            <label className="auto-generation-prompt-field">
              <span>공통 프롬프트</span>
              <textarea rows={12} value={customCommonPrompt} onChange={event => updateCustomPrompt({ commonPrompt: event.target.value })} disabled={!selectedCustomPrompt} placeholder="모든 테스트 시나리오에 적용할 공통 지시문을 입력하세요." />
            </label>
            <div className="auto-generation-variables">
              <span>변수</span>
              <div className="auto-generation-variable-add"><input type="text" value={newVariableName} onChange={event => setNewVariableName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addVariable(); } }} placeholder="변수명 입력" /><button type="button" className="btn-icon" onClick={addVariable}>추가</button></div>
              <p><code>{'{{변수명}}'}</code>을 프롬프트에 쓰거나 직접 추가하세요.</p>
              <div className="auto-generation-variable-list">
                {variableNames.length === 0 ? <span className="auto-generation-variable-empty">등록된 변수가 없습니다.</span> : variableNames.map(name => (
                  <label key={name}><span>{name}</span><input type="text" value={customVariables[name] || ''} onChange={event => updateCustomPrompt({ variables: { ...customVariables, [name]: event.target.value } })} placeholder={`${name} 값`} /><button type="button" className="btn-icon" onClick={() => removeVariable(name)} aria-label={`${name} 변수 삭제`}>X</button></label>
                ))}
              </div>
            </div>
          </div>
          <p className="auto-generation-help">선택한 Custom 버전의 공통 프롬프트와 변수 값이 모든 자동 생성 턴에 함께 적용됩니다.</p>
        </>}

        <div className="auto-generation-modal-actions">
          <button type="button" className="btn-icon" onClick={onClose}>취소</button>
          <button type="button" className="btn-primary" onClick={onSave}>저장</button>
        </div>
      </section>
    </div>
  );
}
