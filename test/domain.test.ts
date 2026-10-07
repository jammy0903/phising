import { registrableDomain } from '@utils/domain';

describe('registrableDomain (PSL 기반)', () => {
  test('서브도메인은 같은 등록가능도메인으로', () => {
    expect(registrableDomain('www.naver.com')).toBe('naver.com');
    expect(registrableDomain('cdn.naver.com')).toBe('naver.com');
  });

  test('2단계 ccTLD 처리 (하드코딩 없이 PSL 로)', () => {
    expect(registrableDomain('shop.coupang.co.kr')).toBe('coupang.co.kr');
    expect(registrableDomain('www.example.co.uk')).toBe('example.co.uk');
  });

  test('PSL 에만 있는 다단계 접미사도 정확히 (하드코딩 목록으론 불가능했던 케이스)', () => {
    // github.io 는 공개 접미사라 user.github.io 의 등록가능도메인은 user.github.io
    expect(registrableDomain('blog.user.github.io')).toBe('user.github.io');
    // s3.amazonaws.com 은 PSL 사설 접미사라, 그 아래 한 라벨이 등록가능도메인이 된다
    expect(registrableDomain('files.s3.amazonaws.com')).toBe('files.s3.amazonaws.com');
  });

  test('원시 IP 는 그대로 반환', () => {
    expect(registrableDomain('192.168.0.1')).toBe('192.168.0.1');
  });

  test('다른 등록가능도메인은 서로 구분', () => {
    expect(registrableDomain('paypal.com.evil.ru')).toBe('evil.ru');
    expect(registrableDomain('paypal.com.evil.ru')).not.toBe(registrableDomain('paypal.com'));
  });
});
