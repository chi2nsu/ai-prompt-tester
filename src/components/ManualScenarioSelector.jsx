export default function ManualScenarioSelector({ goldenSets, activityFilter, scenarioId, onActivityChange, onScenarioChange }) {
  const activities = [...new Set(goldenSets.map(g => g.activityName || '미분류'))];
  const promptOptions = activityFilter === 'all'
    ? goldenSets
    : goldenSets.filter(g => (g.activityName || '미분류') === activityFilter);

  return (
    <div className="scenario-selector-container" style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 0.8fr) minmax(220px, 1.2fr)', gap: '10px', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        Activity 선택
        <select value={activityFilter} onChange={e => onActivityChange(e.target.value)} style={{ padding: '7px 10px', borderRadius: '6px', fontSize: '0.85rem', backgroundColor: '#111419', border: '1px solid var(--surface-border)', color: '#fff' }}>
          <option value="all">전체 Activity</option>
          {activities.map(activity => <option key={activity} value={activity}>{activity}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        프롬프트 종류 선택
        <select value={scenarioId} onChange={e => onScenarioChange(e.target.value)} style={{ padding: '7px 10px', borderRadius: '6px', fontSize: '0.85rem', backgroundColor: '#111419', border: '1px solid var(--surface-border)', color: '#fff' }}>
          <option value="default">-- 직접 입력 / 새 프롬프트 --</option>
          {promptOptions.map(g => <option key={g.id} value={g.id}>{g.title || g.name || '(제목 없음)'} ({g.testCases?.length || 0} cases)</option>)}
        </select>
      </label>
    </div>
  );
}
