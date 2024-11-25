// src/contentScript/index.ts
import { JSIssue } from "@utils/api/types";
import { jsAnalysisService } from '@services/jsAnalysisService';

// 분석 결과를 background로 전송하는 함수
function sendToBackground(issues: JSIssue[]) {
  chrome.runtime.sendMessage({
    type: 'JS_ANALYSIS_RESULT',
    data: { issues }
  });
}

// 분석 시작
function initializeAnalysis() {
  jsAnalysisService.startAnalysis((issues: JSIssue[]) => {
    if (issues.length > 0) {
      sendToBackground(issues);
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

// MutationObserver로 DOM 변경 감지
const observer = new MutationObserver(() => {
  if (jsAnalysisService) {
    const result = jsAnalysisService.analyze();
    if (result.issues.length > 0) {
      sendToBackground(result.issues);
    }
  }
});

// DOM 변경 감지 시작
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

// 페이지 언로드 시 분석 중지
window.addEventListener('unload', () => {
  observer.disconnect();
  jsAnalysisService.stopAnalysis();
});