// src/services/urlHeuristics.ts
//
// 네트워크 호출 없이 URL 문자열만으로 피싱 의심 신호를 뽑는 오프라인 휴리스틱.
// 타이포스쿼팅/브랜드 사칭, punycode(IDN 호모그래프), 의심 TLD, 과다 서브도메인,
// 원시 IP 호스트, userinfo(@) 혼동 등. 각 신호를 점수로 환산하고 JSIssue 로 보고한다.

import { JSIssue } from '@utils/api/types';
import { registrableDomain } from '@utils/domain';

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

// 사칭이 잦은 브랜드 → 그 브랜드의 '공식 등록가능도메인' 목록.
// host 라벨에 브랜드가 있는데 등록가능도메인이 공식 목록에 없으면 사칭으로 본다.
// (단순 라벨 비교와 달리 roblox.com.mu 같은 ccTLD 사칭도 잡고,
//  amazon.co.uk 같은 정상 지역 도메인은 공식 목록에 넣어 오탐을 막는다)
const BRAND_OFFICIAL: Record<string, string[]> = {
  paypal: ['paypal.com'],
  apple: ['apple.com', 'icloud.com'],
  google: ['google.com', 'google.co.kr', 'youtube.com', 'gmail.com'],
  microsoft: ['microsoft.com', 'microsoftonline.com', 'live.com', 'office.com', 'outlook.com'],
  amazon: ['amazon.com', 'amazon.co.uk', 'amazon.co.jp', 'amazon.de', 'aws.amazon.com', 'amazonaws.com'],
  facebook: ['facebook.com', 'fb.com'],
  instagram: ['instagram.com'],
  netflix: ['netflix.com'],
  roblox: ['roblox.com'],
  whatsapp: ['whatsapp.com'],
  linkedin: ['linkedin.com'],
  dhl: ['dhl.com'],
  fedex: ['fedex.com'],
  ups: ['ups.com'],
  coinbase: ['coinbase.com'],
  binance: ['binance.com'],
  metamask: ['metamask.io'],
  steam: ['steampowered.com', 'steamcommunity.com'],
  wellsfargo: ['wellsfargo.com'],
  chase: ['chase.com'],
  naver: ['naver.com'],
  kakao: ['kakao.com', 'kakaocorp.com', 'daum.net'],
  toss: ['toss.im'],
  coupang: ['coupang.com'],
  kookmin: ['kbstar.com'],
  kbstar: ['kbstar.com'],
  shinhan: ['shinhan.com'],
  nonghyup: ['nonghyup.com', 'nhbank.com'],
  woori: ['wooribank.com'],
  hana: ['hanabank.com'],
  ibk: ['ibk.co.kr'],
  samsung: ['samsung.com'],
};

// 피싱이 자주 악용하는 무료/간편 호스팅 플랫폼(공개 접미사). 그 자체는 정상이다.
const ABUSED_HOSTING = [
  'replit.app', 'repl.co', 'web.app', 'firebaseapp.com', 'pages.dev', 'workers.dev',
  'vercel.app', 'netlify.app', 'glitch.me', 'github.io', 'r2.dev', 'weebly.com',
  'blogspot.com', '000webhostapp.com', 'herokuapp.com', 'surge.sh', 'onrender.com',
];

// 자격증명/행동 유도 키워드(호스트명에 들어가면 의심도 상승)
const CREDENTIAL_KEYWORDS = /(login|signin|secure|verify|verif|account|update|confirm|wallet|auth|recover|unlock|billing|payment|security|support)/i;

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

  // ⑥ 브랜드 사칭 — 브랜드 라벨이 host 에 있으나 등록가능도메인이 그 브랜드의 공식 목록이 아님
  const labels = hostLabels(host);
  for (const [brand, official] of Object.entries(BRAND_OFFICIAL)) {
    if (labels.includes(brand) && !official.includes(reg)) {
      add('high', `브랜드 '${brand}' 를 사칭한 것으로 의심되는 도메인`, `실제 도메인: ${reg}`, 22);
      break; // 하나만 보고
    }
  }

  // ⑥-2 무료 호스팅 플랫폼 + 자격증명 키워드 조합 (브랜드 없이도 피싱 흔적)
  // 플랫폼 자체는 정상이므로, 호스트명에 login/secure/verify 류가 함께 있을 때만 약하게 본다.
  const onAbusedHosting = ABUSED_HOSTING.some((h) => host === h || host.endsWith('.' + h));
  if (onAbusedHosting && CREDENTIAL_KEYWORDS.test(host)) {
    add('medium', '무료 호스팅 플랫폼에 자격증명 유도 키워드가 포함된 호스트', `host: ${host}`, 15);
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
