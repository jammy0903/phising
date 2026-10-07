import { analyzeUrl } from '@services/urlHeuristics';

describe('urlHeuristics', () => {
  test('정상 사이트는 신호를 거의 내지 않는다', () => {
    const { score, issues } = analyzeUrl('https://www.naver.com/');
    expect(score).toBe(0);
    expect(issues).toHaveLength(0);
  });

  test('브랜드 사칭 도메인을 high 로 잡는다', () => {
    const { issues } = analyzeUrl('https://paypal.com.secure-login.ru/login');
    expect(issues.some((i) => i.severity === 'high' && i.description.includes('paypal'))).toBe(true);
  });

  test('정상 브랜드 도메인은 사칭으로 잡지 않는다', () => {
    const { issues } = analyzeUrl('https://www.paypal.com/signin');
    expect(issues.some((i) => i.description.includes('사칭'))).toBe(false);
  });

  test('원시 IP 호스트를 high 로 잡는다', () => {
    const { issues } = analyzeUrl('http://192.168.0.5/login');
    expect(issues.some((i) => i.severity === 'high' && i.description.includes('IP'))).toBe(true);
  });

  test('punycode(IDN) 도메인을 잡는다', () => {
    const { issues } = analyzeUrl('https://xn--pple-43d.com/');
    expect(issues.some((i) => i.description.includes('punycode'))).toBe(true);
  });

  test('userinfo(@) 혼동을 잡는다', () => {
    const { issues } = analyzeUrl('https://support@evil.example/account');
    expect(issues.some((i) => i.description.includes('사용자정보'))).toBe(true);
  });

  test('의심 TLD 를 잡는다', () => {
    const { issues } = analyzeUrl('https://login-update.zip/');
    expect(issues.some((i) => i.description.includes('TLD'))).toBe(true);
  });

  test('pineapple 은 apple 사칭으로 오탐하지 않는다', () => {
    const { issues } = analyzeUrl('https://pineapple.com/');
    expect(issues.some((i) => i.description.includes('사칭'))).toBe(false);
  });
});
