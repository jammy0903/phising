import { JSIssue } from "@utils/api/types";
import { jsAnalysisService } from '@services/jsAnalysisService';
import { findBusinessNumbers as findBizNos } from '@utils/businessNumber';

// 현재 페이지에서 사업자등록번호 추출(공유 util 사용).
// 전체 innerHTML 과, footer/address 등 특정 요소 텍스트를 함께 검사한다.
function findBusinessNumbers(): string[] {
  const result = new Set<string>(findBizNos(document.documentElement.innerHTML));

  const targetElements = [
    ...document.querySelectorAll('footer'),
    ...document.querySelectorAll('[class*="footer"]'),
    ...document.querySelectorAll('[id*="footer"]'),
    ...document.querySelectorAll('[class*="company"]'),
    ...document.querySelectorAll('[class*="business"]'),
    ...document.querySelectorAll('address'),
    ...document.querySelectorAll('meta[name*="business"]'),
    ...document.querySelectorAll('meta[property*="business"]'),
  ];
  targetElements.forEach(element => {
    const text = element.textContent || element.getAttribute('content') || '';
    findBizNos(text).forEach(n => result.add(n));
  });

  return Array.from(result);
}

// 분석 결과를 background로 전송하는 함수
function sendToBackground(issues: JSIssue[], businessNumbers?: string[]) {
  chrome.runtime.sendMessage({
    type: 'JS_ANALYSIS_RESULT',
    data: {
      issues,
      businessNumbers
    }
  });
}

// 점수가 임계치(warning) 미만이면 정상으로 보고 전송하지 않는다.
// 이렇게 해야 외부 iframe 하나 같은 약한 신호로 모든 사이트에 뱃지가 뜨는 걸 막는다.
function reportIfRisky(issues: JSIssue[]) {
  if (jsAnalysisService.getStatus() === 'safe') return;
  const businessNumbers = findBusinessNumbers();
  sendToBackground(issues, businessNumbers);
}

// 분석 시작
function initializeAnalysis() {
  // JS 분석 시작
  jsAnalysisService.startAnalysis((issues: JSIssue[]) => {
    if (issues.length > 0) {
      reportIfRisky(issues);
    }
  });
}

// 페이지 로드 시 분석 시작
document.addEventListener('DOMContentLoaded', initializeAnalysis);

// 메시지 리스너 (background에서 분석 요청이 올 경우)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_ANALYSIS') {
    initializeAnalysis();
    sendResponse({ success: true });
  }
  return true;
});

// MutationObserver로 DOM 변경 감지 (debounce 적용)
// 디바운스가 없으면 DOM 변경마다 전체 페이지를 재분석해 무거운 사이트가 멈춘다.
let mutationTimer: number | undefined;
const MUTATION_DEBOUNCE_MS = 800;

const observer = new MutationObserver(() => {
  if (!jsAnalysisService) return;
  if (mutationTimer !== undefined) {
    clearTimeout(mutationTimer);
  }
  mutationTimer = window.setTimeout(() => {
    const result = jsAnalysisService.analyze();
    if (result.issues.length > 0) {
      reportIfRisky(result.issues);
    }
  }, MUTATION_DEBOUNCE_MS);
});

// DOM 변경 감지 시작
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

// 페이지 언로드 시 분석 중지
window.addEventListener('unload', () => {
  observer.disconnect();
  if (mutationTimer !== undefined) clearTimeout(mutationTimer);
  jsAnalysisService.stopAnalysis();
});