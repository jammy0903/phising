import { registrableDomain, bodyLooksLikeCredential } from '@services/networkMonitor';

describe('networkMonitor 교차 사이트 판정', () => {
  test('서브도메인은 같은 사이트로 본다 (CDN 오탐 방지)', () => {
    expect(registrableDomain('www.naver.com')).toBe('naver.com');
    expect(registrableDomain('cdn.naver.com')).toBe('naver.com');
    expect(registrableDomain('naver.com')).toBe('naver.com');
  });

  test('2단계 ccTLD(co.kr 등)를 올바르게 처리한다', () => {
    expect(registrableDomain('shop.coupang.co.kr')).toBe('coupang.co.kr');
    expect(registrableDomain('www.example.co.uk')).toBe('example.co.uk');
  });

  test('다른 등록가능도메인은 교차 사이트로 구분된다', () => {
    expect(registrableDomain('evil.example')).not.toBe(registrableDomain('naver.com'));
  });
});

describe('networkMonitor 자격증명 본문 탐지', () => {
  test('formData 키에 password 류가 있으면 탐지', () => {
    expect(bodyLooksLikeCredential({ formData: { email: ['a@b.c'], password: ['x'] } } as any)).toBe(true);
    expect(bodyLooksLikeCredential({ formData: { 비밀번호: ['x'] } } as any)).toBe(true);
  });

  test('일반 폼 데이터는 자격증명으로 보지 않는다', () => {
    expect(bodyLooksLikeCredential({ formData: { query: ['shoes'], page: ['2'] } } as any)).toBe(false);
  });

  test('raw(JSON) 본문에서도 키워드를 찾는다', () => {
    const bytes = new TextEncoder().encode('{"user":"a","pwd":"secret"}').buffer;
    expect(bodyLooksLikeCredential({ raw: [{ bytes }] } as any)).toBe(true);
  });

  test('본문이 없으면 false', () => {
    expect(bodyLooksLikeCredential(null)).toBe(false);
    expect(bodyLooksLikeCredential(undefined)).toBe(false);
  });
});
