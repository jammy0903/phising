// src/utils/businessNumber.ts
//
// 한국 사업자등록번호 추출·검증 유틸. content script 와 popup 이 공유한다.
// (이전엔 content script 안에 중복 구현돼 있었고 체크섬 계산에 버그가 있었음)

const BASIC_PATTERN = /\d{3}[-\s]?\d{2}[-\s]?\d{5}/g;

const KEYWORD_PATTERNS: RegExp[] = [
  /사업자\s*[번호등록]*\s*:?\s*(\d{3}[-\s]?\d{2}[-\s]?\d{5})/,
  /business\s*[number|registration]*\s*:?\s*(\d{3}[-\s]?\d{2}[-\s]?\d{5})/i,
  /registration\s*[number|no]?\s*:?\s*(\d{3}[-\s]?\d{2}[-\s]?\d{5})/i,
];

// 국세청 사업자등록번호 체크섬 검증.
// 가중치 [1,3,7,1,3,7,1,3,5] 를 앞 9자리에 곱해 더하고,
// 9번째 자리(index 8) × 5 를 10으로 나눈 '몫'을 더한 뒤 검증한다.
export function validateBusinessNumber(raw: string): boolean {
  const number = raw.replace(/[-\s]/g, '');
  if (!/^\d{10}$/.test(number)) return false;

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += weights[i] * parseInt(number[i], 10);
  }
  // ⚠️ 정수 몫이어야 한다. 이전 구현의 `* 5 / 10`(부동소수)은 정상 번호도 탈락시킴.
  sum += Math.floor((parseInt(number[8], 10) * 5) / 10);

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(number[9], 10);
}

// HTML/텍스트 문자열에서 유효한 사업자번호(정규화된 10자리)들을 추출한다.
export function findBusinessNumbers(htmlOrText: string): string[] {
  const found = new Set<string>();
  if (!htmlOrText) return [];

  for (const match of htmlOrText.match(BASIC_PATTERN) || []) {
    const cleaned = match.replace(/[-\s]/g, '');
    if (validateBusinessNumber(cleaned)) found.add(cleaned);
  }

  for (const pattern of KEYWORD_PATTERNS) {
    const m = htmlOrText.match(pattern);
    if (m && m[1]) {
      const cleaned = m[1].replace(/[-\s]/g, '');
      if (validateBusinessNumber(cleaned)) found.add(cleaned);
    }
  }

  return Array.from(found);
}
