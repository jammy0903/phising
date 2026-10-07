// src/utils/domain.ts
//
// 등록가능도메인(eTLD+1) 계산. 교차 사이트 판정의 핵심이라
// 하드코딩 ccTLD 목록 대신 Public Suffix List(psl)를 사용한다.
// psl.get() 은 전체 공개 접미사 목록을 기준으로 정확히 eTLD+1 을 반환한다.

import psl from 'psl';

// hostname → 등록가능도메인. psl 이 판정하지 못하면(사설 호스트, 원시 IP 등)
// 안전하게 원본 host(소문자)를 반환한다.
export function registrableDomain(host: string): string {
  const h = (host || '').toLowerCase().replace(/\.$/, '');
  if (!h) return '';

  // 원시 IP(IPv4/IPv6)는 그대로 반환 — 도메인 개념이 없다.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return h;

  try {
    const domain = psl.get(h);
    return domain || h;
  } catch {
    return h;
  }
}
