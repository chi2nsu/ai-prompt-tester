import { useRef } from 'react';

export default function MultiTurnResults({ sessions, activeSessionKey, onSessionChange }) {
  const activeSession = sessions.find(session => session.key === activeSessionKey) || sessions[0];
  const hasVisibleResult = sessions.some(session => session.turns.length > 0 || session.error);
  const touchStartX = useRef(null);

  const handleTouchEnd = (event) => {
    if (touchStartX.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 56 || !activeSession) return;

    const currentIndex = sessions.findIndex(session => session.key === activeSession.key);
    const nextIndex = distance < 0 ? currentIndex + 1 : currentIndex - 1;
    if (sessions[nextIndex]) onSessionChange(sessions[nextIndex].key);
  };

  if (!hasVisibleResult) {
    return <div className="empty-state" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}><p>세션을 선택해 첫 메시지를 보내거나 AI 자동 진행을 시작하세요.</p></div>;
  }

  return (
    <div>
      <div className="multi-turn-session-tabs" role="tablist" aria-label="대화 세션 선택">
        {sessions.map(session => (
          <button key={session.key} type="button" role="tab" aria-selected={session.key === activeSession?.key} className={`multi-turn-session-tab ${session.key === activeSession?.key ? 'is-active' : ''}`} onClick={() => onSessionChange(session.key)}>
            {session.modelName} · 세션 {session.sessionIndex + 1}<span>{session.error ? '오류' : `${session.turns.length}턴`}</span>
          </button>
        ))}
      </div>

      {activeSession && (
        <div className="multi-turn-session-conversation" onTouchStart={event => { touchStartX.current = event.touches[0].clientX; }} onTouchEnd={handleTouchEnd} onTouchCancel={() => { touchStartX.current = null; }}>
          {activeSession.turns.length === 0 ? (
            activeSession.error
              ? <p className="multi-turn-session-empty" style={{ color: 'var(--danger, #d14343)' }}>자동 진행에 실패했습니다: {activeSession.error}</p>
              : <p className="multi-turn-session-empty">아직 대화가 없습니다. 아래 플로팅 창에서 이 세션의 첫 메시지를 입력하세요.</p>
          ) : activeSession.turns.map((turn, turnIndex) => (
            <div key={turn.id} className="multi-turn-turn">
              <div className="multi-turn-turn-label">TURN {turnIndex + 1}</div>
              {turn.testCase && <span className="multi-turn-case-badge">테스트 케이스 · {turn.testCase.category}</span>}
              <div className="multi-turn-bubble multi-turn-bubble-user"><strong>유저</strong><div>{turn.userInput}</div></div>
              <div className={`multi-turn-bubble multi-turn-bubble-ai ${turn.response.isError ? 'is-error' : ''}`}><strong>{activeSession.modelName}{turn.response.responseTimeMs ? ` · ${(turn.response.responseTimeMs / 1000).toFixed(1)}초` : ''}</strong><div>{turn.response.text}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
