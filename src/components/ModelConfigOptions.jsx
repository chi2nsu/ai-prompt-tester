export default function ModelConfigOptions({ model, config, onChange, disabled = false }) {
  if (!config) return null;
  const thinkingLevels = model.thinkingLevels || ['none', 'minimal', 'low', 'medium', 'high'];
  const selectedThinkingLevel = thinkingLevels.includes(config.thinkingLevel) ? config.thinkingLevel : (model.defaultThinkingLevel || 'none');

  return (
    <div style={{ padding: '8px', backgroundColor: 'var(--surface-border)', opacity: 0.9, borderRadius: '6px', fontSize: '0.8rem', marginTop: '4px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {model.supportsTemperature !== false && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Temp: {config.temperature}</span><input type="range" min="0" max="2" step="0.1" value={config.temperature ?? 0.7} onChange={e => onChange('temperature', parseFloat(e.target.value))} disabled={disabled} style={{ width: '80px' }} /></div>}
        {model.supportsReasoningEffort && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}><span>Reasoning:</span><select value={config.reasoningEffort || 'none'} onChange={e => onChange('reasoningEffort', e.target.value)} disabled={disabled} style={{ padding: '2px 4px', fontSize: '0.75rem', width: '120px', borderRadius: '4px', border: '1px solid var(--surface-border)' }}><option value="none">Reasoning none</option><option value="low">Reasoning low</option><option value="medium">Reasoning medium</option><option value="high">Reasoning high</option><option value="xhigh">Reasoning xhigh</option></select></div>}
        {model.supportsVerbosity && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}><span>Verbosity:</span><select value={config.verbosity || 'none'} onChange={e => onChange('verbosity', e.target.value)} disabled={disabled} style={{ padding: '2px 4px', fontSize: '0.75rem', width: '120px', borderRadius: '4px', border: '1px solid var(--surface-border)' }}><option value="none">none</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></div>}
        {model.provider === 'Google' && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}><span>Thinking:</span><select value={selectedThinkingLevel} onChange={e => onChange('thinkingLevel', e.target.value)} disabled={disabled} style={{ padding: '2px 4px', fontSize: '0.75rem', width: '80px', borderRadius: '4px', border: '1px solid var(--surface-border)' }}>{thinkingLevels.map(level => <option key={level} value={level}>{level}</option>)}</select></div>}
      </div>
    </div>
  );
}
