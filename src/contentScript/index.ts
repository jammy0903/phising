import { JSIssue } from "@utils/api/types";
import { jsAnalysisService } from '@services/jsAnalysisService';

// 사업자등록번호 찾기 관련 패턴들
const BUSINESS_NUMBER_PATTERNS = {
  // 기본 사업자등록번호 패턴 (XXX-XX-XXXXX)
  basic: /\d{3}[-\s]?\d{2}[-\s]?\d{5}/g,

  // 텍스트와 함께 있는 패턴들
  withKeywords: [
    /사업자\s*[번호등록]*\s*:?\s*(\d{3}[-\s]?\d{2}[-\s]?\d{5})/,
    /business\s*[number|registration]*\s*:?\s*(\d{3}[-\s]?\d{2}[-\s]?\d{5})/i,
    /registration\s*[number|no]?\s*:?\s*(\d{3}[-\s]?\d{2}[-\s]?\d{5})/i,
  ]
};

// 사업자등록번호 유효성 검사
function validateBusinessNumber(number: string): boolean {
  if (!/^\d{10}$/.test(number)) return false;

  const checksum = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;

  for (let i = 0; i < checksum.length; i++) {
    sum += checksum[i] * parseInt(number[i]);
  }

  sum += parseInt(number[8]) * 5 / 10;
  const lastDigit = (10 - (sum % 10)) % 10;
  return lastDigit === parseInt(number[9]);
}

// 사업자등록번호 찾는 함수
function findBusinessNumbers(): string[] {
  const businessNumbers = new Set<string>();

  // 1. 전체 HTML 텍스트에서 검색
  const htmlContent = document.documentElement.innerHTML;

  // 기본 패턴 검색
  const basicMatches = htmlContent.match(BUSINESS_NUMBER_PATTERNS.basic) || [];
  basicMatches.forEach(match => {
    const cleaned = match.replace(/[-\s]/g, '');
    if (validateBusinessNumber(cleaned)) {
      businessNumbers.add(cleaned);
    }
  });

  // 키워드와 함께 있는 패턴 검색
  BUSINESS_NUMBER_PATTERNS.withKeywords.forEach(pattern => {
    const matches = htmlContent.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        const number = match[1].replace(/[-\s]/g, '');
        if (validateBusinessNumber(number)) {
          businessNumbers.add(number);
        }
      }
    }
  });

  // 2. 특정 요소들을 중점적으로 검색
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

    // 기본 패턴 검색
    const elementMatches = text.match(BUSINESS_NUMBER_PATTERNS.basic) || [];
    elementMatches.forEach(match => {
      const cleaned = match.replace(/[-\s]/g, '');
      if (validateBusinessNumber(cleaned)) {
        businessNumbers.add(cleaned);
      }
    });
  });

  return Array.from(businessNumbers);
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

// 분석 시작
function initializeAnalysis() {
  // JS 분석 시작
  jsAnalysisService.startAnalysis((issues: JSIssue[]) => {
    if (issues.length > 0) {
      // 사업자등록번호도 함께 찾아서 전송
      const businessNumbers = findBusinessNumbers();
      sendToBackground(issues, businessNumbers);
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
      const businessNumbers = findBusinessNumbers();
      sendToBackground(result.issues, businessNumbers);
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