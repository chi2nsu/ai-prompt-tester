export default function GoldenSetAIGenerator({ activeGoldenSet, setActiveGoldenSet, count, setCount, level, setLevel, models, modelId, setModelId, loading, onGenerate }) {
  return (
    <div style={{ background: 'rgba(99, 102, 241, 0.04)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.15)', marginTop: '20px', marginBottom: '12px' }}>
      <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: '#a5b4fc' }}>✨ AI Auto-Generate Test Cases</h4>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.4' }}>입력된 시스템 프롬프트와 컨텍스트를 분석하여 4가지 유형(정상, 오류, 엣지, 안정성)의 테스트 발화를 자동으로 생성합니다.</p>
      <div className="input-section" style={{ marginBottom: '12px' }}>
        <label htmlFor="prompt-context" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'none', marginBottom: '6px' }}>정상 케이스 상황/질문 (테스트 셋 컨텍스트)</label>
        <textarea id="prompt-context" rows={2} placeholder="정상 케이스 생성 시 반영할 특정 미션, 상황, 질문 또는 대화 주제를 입력하세요." value={activeGoldenSet.context || ''} onChange={e => setActiveGoldenSet(prev => ({ ...prev, context: e.target.value }))} style={{ fontSize: '0.8rem', padding: '8px', backgroundColor: '#111419' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Count/Category: <select value={count} onChange={e => setCount(parseInt(e.target.value))} style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', fontSize: '0.75rem', color: '#fff' }}><option value={1}>1 case</option><option value={2}>2 cases</option><option value={3}>3 cases</option></select></label>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Level: <select value={level} onChange={e => setLevel(e.target.value)} style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', fontSize: '0.75rem', color: '#fff' }}><option value="Beginner">Beginner</option><option value="Intermediate">Intermediate</option><option value="Advanced">Advanced</option></select></label>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>생성 모델: <select value={modelId} onChange={e => setModelId(e.target.value)} style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', fontSize: '0.75rem', color: '#fff' }}>{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
        <button className="btn-primary" onClick={onGenerate} disabled={loading || !activeGoldenSet.systemPrompt.trim()} style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#4f46e5', borderColor: '#4f46e5', height: '30px' }}>{loading ? 'Generating...' : '🪄 Generate with AI'}</button>
      </div>
    </div>
  );
}
