export const DEFAULT_VALIDATION_CRITERIA = [
  {
    id: 'format-structure',
    name: '형식 및 필수 항목 준수',
    description: '시스템 프롬프트에 정의된 출력 형식, 필수 항목, 구조를 지켰는지 확인합니다.',
    scope: 'response',
    required: true,
    builtIn: true,
  },
  {
    id: 'context-relevance',
    name: '문맥 및 의도 적합성',
    description: '사용자 입력과 대화 문맥을 이해하고, 프롬프트의 의도에 맞게 응답했는지 확인합니다.',
    scope: 'response',
    required: false,
    builtIn: true,
  },
  {
    id: 'safety-tone',
    name: '안전성 및 톤',
    description: '금지된 내용이 없고, 대상 사용자에게 적절하고 안전한 말투를 유지했는지 확인합니다.',
    scope: 'response',
    required: true,
    builtIn: true,
  },
  {
    id: 'conversation-flow',
    name: '대화 흐름 유지',
    description: '멀티턴 대화에서 이전 맥락을 유지하고 자연스럽게 다음 대화를 이끌었는지 확인합니다.',
    scope: 'conversation',
    required: false,
    builtIn: true,
  },
];

export const CRITERIA_SCOPE_LABELS = {
  response: '응답별',
  conversation: '전체 대화',
};
