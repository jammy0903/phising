// src/services/networkMonitor.ts
//
// 페이지가 '외부(교차 사이트) 도메인'으로 보내는 전송을 background 에서 관찰한다.
// 정규식 코드 분석과 달리 실제 네트워크 요청을 보므로, 특히 요청 본문에
// 자격증명(비밀번호/카드번호 등)이 담겨 외부로 나가는 POST 를 고신호로 탐지한다.
//
// 관찰 전용이며 어떤 요청도 차단하지 않는다(blocking X). webRequest 권한과
// 넓은 host_permissions(*://*/*) 가 있어야 리스너가 요청을 볼 수 있다.

import { JSIssue } from '@utils/api/types';

export interface NetworkFinding {
  tabId: number;
  issue: JSIssue;
}

// 등록가능도메인(eTLD+1) 비교용 — 흔한 2단계 ccTLD 목록
const TWO_LEVEL_TLDS = new Set<string>([
  'co.kr', 'ne.kr', 'or.kr', 'go.kr', 're.kr', 'pe.kr',
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk',
  'co.jp', 'or.jp', 'ne.jp', 'go.jp',
  'com.cn', 'net.cn', 'org.cn', 'com.au', 'com.br', 'com.tw',
]);

// hostname → 등록가능도메인(근사치). 라이브러리 없이 마지막 2~3라벨로 추정.
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  if (TWO_LEVEL_TLDS.has(last2)) return parts.slice(-3).join('.');
  return last2;
}

// 요청 본문에서 자격증명으로 보이는 흔적을 찾는다.
const CREDENTIAL_KEY = /(pass(word|wd)?|pwd|login|credential|card(number|no)?|cvc|cvv|ssn|secret|otp|주민|비밀번호|카드)/i;

export function bodyLooksLikeCredential(body?: chrome.webRequest.WebRequestBody | null): boolean {
  if (!body) return false;

  // 1) formData: 키 이름으로 판정
  if (body.formData) {
    for (const key of Object.keys(body.formData)) {
      if (CREDENTIAL_KEY.test(key)) return true;
    }
  }

  // 2) raw body: 앞부분만 디코드해서 키워드 탐색(JSON/urlencoded 대응)
  if (body.raw && body.raw.length > 0) {
    try {
      let text = '';
      for (const chunk of body.raw) {
        if (chunk.bytes) {
          text += new TextDecoder('utf-8', { fatal: false }).decode(chunk.bytes);
          if (text.length > 4096) break; // 과도한 디코드 방지
        }
      }
      if (CREDENTIAL_KEY.test(text)) return true;
    } catch {
      // 디코드 실패는 무시
    }
  }

  return false;
}

// 교차 사이트 요청을 분류해 JSIssue 를 만든다. 신호가 약하면 null.
function classify(
  details: chrome.webRequest.WebRequestBodyDetails,
  destHost: string
): JSIssue | null {
  const type = details.type;   // xmlhttprequest | ping | websocket | sub_frame ...
  const method = (details.method || 'GET').toUpperCase();

  // ① 자격증명으로 보이는 본문이 외부로 전송 → 가장 강한 신호
  if ((type === 'xmlhttprequest' || type === 'ping') && bodyLooksLikeCredential(details.requestBody)) {
    return {
      type: 'dataExfiltration',
      severity: 'high',
      description: `자격증명으로 보이는 데이터가 외부 도메인(${destHost})으로 전송됨`,
      location: `${method} ${type} → ${destHost}`,
    };
  }

  // ② sendBeacon(ping) — 백그라운드 비동기 전송, 추적/유출에 흔히 쓰임
  if (type === 'ping') {
    return {
      type: 'dataExfiltration',
      severity: 'medium',
      description: `외부 도메인(${destHost})으로 sendBeacon 전송 감지`,
      location: `beacon → ${destHost}`,
    };
  }

  // ③ 외부 WebSocket 연결
  if (type === 'websocket') {
    return {
      type: 'dataExfiltration',
      severity: 'medium',
      description: `외부 도메인(${destHost})으로 WebSocket 연결 감지`,
      location: `ws → ${destHost}`,
    };
  }

  // ④ 그 외 cross-site POST — 약한 신호(low). GET 은 CDN/API 로 흔해 무시.
  if (type === 'xmlhttprequest' && method !== 'GET' && method !== 'HEAD') {
    return {
      type: 'dataExfiltration',
      severity: 'low',
      description: `외부 도메인(${destHost})으로 ${method} 요청 감지`,
      location: `${method} → ${destHost}`,
    };
  }

  return null;
}

/**
 * 네트워크 모니터링 시작. 교차 사이트 전송이 감지되면 onFinding 으로 보고한다.
 * @returns 리스너를 해제하는 함수
 */
export function startNetworkMonitoring(onFinding: (finding: NetworkFinding) => void): () => void {
  if (typeof chrome === 'undefined' || !chrome.webRequest) {
    return () => {};
  }

  const handler = (details: chrome.webRequest.WebRequestBodyDetails) => {
    try {
      if (details.tabId < 0) return;            // 확장 자신/백그라운드 요청 무시
      if (!details.initiator) return;           // 시작 출처 불명 → 비교 불가

      let destHost: string;
      let initHost: string;
      try {
        destHost = new URL(details.url).hostname;
        initHost = new URL(details.initiator).hostname;
      } catch {
        return;
      }
      if (!destHost || !initHost) return;

      // 같은 사이트(등록가능도메인 일치)면 무시 → CDN/서브도메인 오탐 방지
      if (registrableDomain(destHost) === registrableDomain(initHost)) return;

      const issue = classify(details, destHost);
      if (issue) {
        onFinding({ tabId: details.tabId, issue });
      }
    } catch (e) {
      console.error('[networkMonitor] handler error:', e);
    }
  };

  chrome.webRequest.onBeforeRequest.addListener(
    handler,
    { urls: ['<all_urls>'], types: ['xmlhttprequest', 'ping', 'websocket', 'sub_frame'] },
    ['requestBody']
  );

  return () => chrome.webRequest.onBeforeRequest.removeListener(handler);
}
