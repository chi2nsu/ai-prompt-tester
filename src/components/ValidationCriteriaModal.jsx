import { useEffect, useState } from 'react';
import { CRITERIA_SCOPE_LABELS } from '../data/validationCriteria';

const emptyCriterion = () => ({
  id: crypto.randomUUID(),
  name: '',
  description: '',
  scope: 'response',
  required: false,
  builtIn: false,
});

export default function ValidationCriteriaModal({ isOpen, criteria, selectedIds, onSave, onClose }) {
  const [draftCriteria, setDraftCriteria] = useState(criteria);
  const [draftSelectedIds, setDraftSelectedIds] = useState(selectedIds);
  const [editingId, setEditingId] = useState(null);
  const [newCriterion, setNewCriterion] = useState(emptyCriterion);

  useEffect(() => {
    if (!isOpen) return;
    setDraftCriteria(criteria);
    setDraftSelectedIds(selectedIds);
    setEditingId(null);
    setNewCriterion(emptyCriterion());
  }, [isOpen, criteria, selectedIds]);

  if (!isOpen) return null;

  const toggleCriterion = id => setDraftSelectedIds(previous => (
    previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]
  ));

  const updateCriterion = (id, changes) => setDraftCriteria(previous => previous.map(criterion => (
    criterion.id === id ? { ...criterion, ...changes } : criterion
  )));

  const addCriterion = () => {
    if (!newCriterion.name.trim() || !newCriterion.description.trim()) return;
    setDraftCriteria(previous => [...previous, { ...newCriterion, name: newCriterion.name.trim(), description: newCriterion.description.trim() }]);
    setDraftSelectedIds(previous => [...previous, newCriterion.id]);
    setNewCriterion(emptyCriterion());
  };

  const removeCriterion = id => {
    setDraftCriteria(previous => previous.filter(criterion => criterion.id !== id));
    setDraftSelectedIds(previous => previous.filter(item => item !== id));
  };

  return (
    <div className="full-test-modal-backdrop" role="presentation">
      <section className="full-test-modal validation-criteria-modal" role="dialog" aria-modal="true" aria-labelledby="validation-criteria-title">
        <div className="full-test-modal-header">
          <div><span>VALIDATION CRITERIA</span><h2 id="validation-criteria-title">검증 기준 선택 및 관리</h2></div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="검증 기준 모달 닫기">✕</button>
        </div>
        <p className="full-test-modal-description">선택한 기준은 이번 전체 테스트에 적용됩니다. 필수 기준을 통과하지 못하면 전체 결과도 실패로 표시합니다.</p>

        <div className="criteria-list">
          {draftCriteria.map(criterion => (
            <article className={`criterion-card ${draftSelectedIds.includes(criterion.id) ? 'is-selected' : ''}`} key={criterion.id}>
              <label className="criterion-select">
                <input type="checkbox" checked={draftSelectedIds.includes(criterion.id)} onChange={() => toggleCriterion(criterion.id)} />
                <span>
                  <strong>{criterion.name}</strong>
                  <small>{CRITERIA_SCOPE_LABELS[criterion.scope] || '응답별'} · {criterion.required ? '필수 기준' : '일반 기준'}</small>
                </span>
              </label>
              {editingId === criterion.id ? (
                <div className="criterion-edit-fields">
                  <input type="text" value={criterion.name} onChange={event => updateCriterion(criterion.id, { name: event.target.value })} placeholder="기준 이름" />
                  <textarea rows={3} value={criterion.description} onChange={event => updateCriterion(criterion.id, { description: event.target.value })} placeholder="판단 방법" />
                  <div className="criterion-edit-options">
                    <select value={criterion.scope} onChange={event => updateCriterion(criterion.id, { scope: event.target.value })}>
                      <option value="response">응답별 평가</option>
                      <option value="conversation">전체 대화 평가</option>
                    </select>
                    <label><input type="checkbox" checked={criterion.required} onChange={event => updateCriterion(criterion.id, { required: event.target.checked })} /> 필수 기준</label>
                    <button type="button" className="btn-icon" onClick={() => setEditingId(null)}>완료</button>
                  </div>
                </div>
              ) : (
                <>
                  <p>{criterion.description}</p>
                  <div className="criterion-card-actions">
                    <button type="button" className="btn-icon" onClick={() => setEditingId(criterion.id)}>수정</button>
                    {!criterion.builtIn && <button type="button" className="btn-icon criterion-delete" onClick={() => removeCriterion(criterion.id)}>삭제</button>}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>

        <div className="criterion-new-form">
          <h3>새 검증 기준</h3>
          <input type="text" value={newCriterion.name} onChange={event => setNewCriterion(previous => ({ ...previous, name: event.target.value }))} placeholder="예: 정답 직접 제공 금지" />
          <textarea rows={3} value={newCriterion.description} onChange={event => setNewCriterion(previous => ({ ...previous, description: event.target.value }))} placeholder="AI 평가기가 확인할 구체적인 조건을 적으세요." />
          <div className="criterion-edit-options">
            <select value={newCriterion.scope} onChange={event => setNewCriterion(previous => ({ ...previous, scope: event.target.value }))}>
              <option value="response">응답별 평가</option>
              <option value="conversation">전체 대화 평가</option>
            </select>
            <label><input type="checkbox" checked={newCriterion.required} onChange={event => setNewCriterion(previous => ({ ...previous, required: event.target.checked }))} /> 필수 기준</label>
            <button type="button" className="btn-icon" onClick={addCriterion}>기준 추가</button>
          </div>
        </div>

        <div className="full-test-modal-footer">
          <span>{draftSelectedIds.length}개 기준 선택됨</span>
          <div><button type="button" className="btn-icon" onClick={onClose}>취소</button><button type="button" className="btn-primary" onClick={() => onSave(draftCriteria, draftSelectedIds)}>선택 저장</button></div>
        </div>
      </section>
    </div>
  );
}
