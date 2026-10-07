import { validateBusinessNumber, findBusinessNumbers } from '@utils/businessNumber';

describe('validateBusinessNumber', () => {
  // 앞 9자리 123456789 의 올바른 체크숫자는 1 (수기 계산)
  test('체크섬이 맞는 번호는 true (이전 float 버그로 실패하던 케이스)', () => {
    expect(validateBusinessNumber('1234567891')).toBe(true);
    expect(validateBusinessNumber('123-45-67891')).toBe(true);
  });

  test('체크숫자가 틀리면 false', () => {
    expect(validateBusinessNumber('1234567890')).toBe(false);
  });

  test('자릿수/형식이 안 맞으면 false', () => {
    expect(validateBusinessNumber('12345')).toBe(false);
    expect(validateBusinessNumber('abcdefghij')).toBe(false);
  });
});

describe('findBusinessNumbers', () => {
  test('HTML 텍스트에서 유효 번호만 추출', () => {
    // 123-45-67890 은 체크숫자가 틀린(정답은 ...1) 번호라 걸러져야 한다
    const html = `<footer>사업자등록번호: 123-45-67891 | 잘못된번호 123-45-67890</footer>`;
    expect(findBusinessNumbers(html)).toEqual(['1234567891']);
  });

  test('번호가 없으면 빈 배열', () => {
    expect(findBusinessNumbers('<p>회사 소개</p>')).toEqual([]);
    expect(findBusinessNumbers('')).toEqual([]);
  });
});
