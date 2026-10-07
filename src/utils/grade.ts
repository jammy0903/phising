// src/utils/grade.ts
//
// 이슈 목록(JS/URL/네트워크/회사 등 공통으로 severity 를 가짐)을
// 종합 등급(안전/주의/위험)으로 환산한다. 개수가 아니라 '심각도'로 판정해
// low 신호가 많다고 위험으로 뜨지 않도록 한다.

import { Severity } from '@utils/api/types';

export type Status = 'safe' | 'warning' | 'danger';

export interface Grade {
  status: Status;
  high: number;
  medium: number;
  low: number;
  total: number;
}

const ORDER: Record<Status, number> = { safe: 0, warning: 1, danger: 2 };

export function gradeIssues(issues: ReadonlyArray<{ severity: Severity }>): Grade {
  const high = issues.filter((i) => i.severity === 'high').length;
  const medium = issues.filter((i) => i.severity === 'medium').length;
  const low = issues.filter((i) => i.severity === 'low').length;

  const status: Status = high > 0 ? 'danger' : medium > 0 ? 'warning' : 'safe';
  return { status, high, medium, low, total: issues.length };
}

// 둘 중 더 나쁜 등급을 반환(여러 소스 결합용)
export function worseStatus(a: Status, b: Status): Status {
  return ORDER[a] >= ORDER[b] ? a : b;
}

export const STATUS_LABEL: Record<Status, string> = {
  safe: '안전',
  warning: '주의',
  danger: '위험',
};
