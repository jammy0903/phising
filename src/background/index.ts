// src/background/index.ts
import type { JSIssue } from '@utils/api/types';

interface StorageData {
  notificationsEnabled: boolean;
  lastAnalysisResults: Record<string, JSIssue[]>;
  isLoggedIn: boolean;
}

// 초기 스토리지 데이터
const initialStorageData: StorageData = {
  notificationsEnabled: true,
  lastAnalysisResults: {},
  isLoggedIn: false
};

// 확장프로그램 설치/업데이트 시
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set(initialStorageData);
});

// 탭 URL 변경 감지
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    chrome.tabs.sendMessage(tabId, { type: 'REQUEST_ANALYSIS' });
  }
});

// contentScript로부터의 분석 결과 처리
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'JS_ANALYSIS_RESULT') {
    handleAnalysisResult(message.data.issues, sender.tab?.id);
  }
  return true;
});

// 분석 결과 처리 함수
async function handleAnalysisResult(issues: JSIssue[], tabId?: number) {
  if (!tabId) return;

  // 스토리지에 결과 저장
  const { lastAnalysisResults } = await chrome.storage.local.get('lastAnalysisResults');
  await chrome.storage.local.set({
    lastAnalysisResults: {
      ...lastAnalysisResults,
      [tabId.toString()]: issues
    }
  });

  // 위험도 높은 이슈가 있으면 알림 생성
  const hasHighRisk = issues.some(issue => issue.severity === 'high');
  if (hasHighRisk) {
    await createNotification(issues);
  }

  // 팝업에 뱃지 표시
  await updateBadge(tabId, issues);
}

// 알림 생성
async function createNotification(issues: JSIssue[]) {
  const { notificationsEnabled } = await chrome.storage.local.get('notificationsEnabled');
  if (!notificationsEnabled) return;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: '/icons/warning-icon.png',
    title: '보안 위험 감지',
    message: `${issues.length}개의 의심스러운 동작이 감지되었습니다.`
  });
}

// 뱃지 업데이트
async function updateBadge(tabId: number, issues: JSIssue[]) {
  const highRiskCount = issues.filter(issue => issue.severity === 'high').length;

  if (highRiskCount > 0) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#FF0000' });
    chrome.action.setBadgeText({ tabId, text: highRiskCount.toString() });
  } else if (issues.length > 0) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#FFA500' });
    chrome.action.setBadgeText({ tabId, text: '!' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}