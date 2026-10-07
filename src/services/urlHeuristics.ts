// src/services/urlHeuristics.ts
//
// 네트워크 호출 없이 URL 문자열만으로 피싱 의심 신호를 뽑는 오프라인 휴리스틱.
// 타이포스쿼팅/브랜드 사칭, punycode(IDN 호모그래프), 의심 TLD, 과다 서브도메인,
// 원시 IP 호스트, userinfo(@) 혼동 등. 각 신호를 점수로 환산하고 JSIssue 로 보고한다.

import { JSIssue } from '@utils/api/types';
import { registrableDomain } from './networkMonitor';

export interface UrlHeuristicResult {
  score: number;
  issues: JSIssue[];
}

// 피싱이 즐겨 쓰는 저가/신규/무료 TLD (완전하지 않음, 대표적인 것만)
const SUSPICIOUS_TLDS = new Set<string>([
  'zip', 'mov', 'top', 'xyz', 'tk', 'ml', 'ga', 'cf', 'gq', 'work',
  'click', 'country', 'kim', 'loan', 'review', 'date', 'racing', 'stream',
  'win', 'bid', 'vip', 'rest', 'fit', 'surf', 'cam', 'quest', 'cfd', 'sbs',
]);

// 사칭이 잦은 브랜드/서비스의 '주 라벨'. host 라벨과 정확히 비교한다.
const BRANDS = [
  'paypal', 'apple', 'google', 'microsoft', 'amazon', 'facebook', 'instagram',
  'netflix', 'naver', 'kakao', 'daum', 'toss', 'coupang', 'kookmin', 'shinhan',
  'nonghyup', 'woori', 'hana', 'ibk', 'kbstar', 'samsung',
];

function makeIssue(severity: JSIssue['severity'], description: string, location: string): JSIssue {
  return { type: 'suspiciousUrl', severity, description, location };
}

// 호스트를 라벨 단위로 분해(점/하이픈 기준)해 브랜드 라벨 비교에 쓴다.
function hostLabels(host: string): string[] {
  return host.toLowerCase().split(/[.-]/).filter(Boolean);
}

export function analyzeUrl(rawUrl: string): UrlHeuristicResult {
  const issues: JSIssue[] = [];
  let score = 0;

  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { score: 0, issues: [] };
  }

  // 분석 대상은 http(s) 만
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { score: 0, issues: [] };
  }

  const host = u.hostname.toLowerCase();
  const add = (sev: JSIssue['severity'], desc: string, loc: string, pts: number) => {
    issues.push(makeIssue(sev, desc, loc));
    score += pts;
  };

  // ① userinfo(@) 포함 — 진짜 호스트를 가리는 고전적 혼동 수법
  if (u.username || u.password) {
    add('high', 'URL 에 사용자정보(@)가 포함되어 실제 호스트를 숨길 수 있음', `userinfo: ${u.username}@`, 25);
  }

  // ② 원시 IP 주소를 호스트로 사용
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') /* IPv6 */) {
    add('high', '도메인 대신 원시 IP 주소를 사용(피싱에서 흔함)', `host: ${host}`, 25);
  }

  // ③ punycode / IDN 호모그래프 (xn-- 로 인코딩됨)
  if (host.split('.').some((label) => label.startsWith('xn--'))) {
    add('high', 'punycode(IDN) 도메인 — 유사 문자로 정상 사이트를 흉내낼 수 있음', `host: ${host}`, 30);
  }

  // ④ 의심 TLD
  const tld = host.split('.').pop() || '';
  if (SUSPICIOUS_TLDS.has(tld)) {
    add('medium', `피싱에 자주 쓰이는 TLD(.${tld})`, `tld: .${tld}`, 12);
  }

  // ⑤ 과다 서브도메인 (등록가능도메인 앞 라벨이 3개 이상)
  const reg = registrableDomain(host);
  const regLabelCount = reg.split('.').length;
  const subLabelCount = Math.max(0, host.split('.').length - regLabelCount);
  if (subLabelCount >= 3) {
    add('low', `서브도메인이 과도하게 많음(${subLabelCount}단계)`, `host: ${host}`, 8);
  }

  // ⑥ 브랜드 사칭 — 브랜드 라벨이 host 에 있으나 등록가능도메인 주 라벨이 그 브랜드가 아님
  const regMainLabel = reg.split('.')[0];
  const labels = hostLabels(host);
  for (const brand of BRANDS) {
    if (labels.includes(brand) && regMainLabel !== brand) {
      add('high', `브랜드 '${brand}' 를 사칭한 것으로 의심되는 도메인`, `실제 도메인: ${reg}`, 22);
      break; // 하나만 보고
    }
  }

  // ⑦ 과도하게 긴 호스트 / 하이픈 남용
  if (host.length > 40) {
    add('low', '비정상적으로 긴 호스트명', `len: ${host.length}`, 5);
  }
  const hyphenCount = (host.match(/-/g) || []).length;
  if (hyphenCount >= 4) {
    add('low', `하이픈이 많은 호스트명(${hyphenCount}개)`, `host: ${host}`, 5);
  }

  // ⑧ 비표준 포트
  if (u.port && u.port !== '80' && u.port !== '443') {
    add('low', `비표준 포트 사용(:${u.port})`, `port: ${u.port}`, 5);
  }

  return { score, issues };
}
