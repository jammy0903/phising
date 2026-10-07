import { gradeIssues, worseStatus } from '@utils/grade';

describe('gradeIssues', () => {
  test('이슈 없으면 safe', () => {
    const g = gradeIssues([]);
    expect(g.status).toBe('safe');
    expect(g.total).toBe(0);
  });

  test('low 만 여러 개여도 safe (개수가 아니라 심각도로 판정)', () => {
    const g = gradeIssues([{ severity: 'low' }, { severity: 'low' }, { severity: 'low' }]);
    expect(g.status).toBe('safe');
    expect(g.low).toBe(3);
  });

  test('medium 있으면 warning', () => {
    expect(gradeIssues([{ severity: 'medium' }, { severity: 'low' }]).status).toBe('warning');
  });

  test('high 하나라도 있으면 danger', () => {
    expect(gradeIssues([{ severity: 'low' }, { severity: 'high' }]).status).toBe('danger');
  });
});

describe('worseStatus', () => {
  test('더 나쁜 등급을 고른다', () => {
    expect(worseStatus('safe', 'warning')).toBe('warning');
    expect(worseStatus('danger', 'warning')).toBe('danger');
    expect(worseStatus('safe', 'safe')).toBe('safe');
  });
});
