// src/background/index.ts
import type { JSIssue } from '@utils/api/types';
import { startNetworkMonitoring, NetworkFinding } from '@services/networkMonitor';
import { analyzeUrl } from '@services/urlHeuristics';

interface StorageData {
  notificationsEnabled: boolean;
  // 팝업이 읽는 '병합된' 결과(URL 휴리스틱 + JS 분석 + 네트워크 모니터링)
  lastAnalysisResults: Record<string, JSIssue[]>;
  // 소스별 원본(병합 재계산용)
  urlIssues: Record<string, JSIssue[]>;
  jsIssues: Record<string, JSIssue[]>;
  networkIssues: Record<string, JSIssue[]>;
  // 탭별 알림 중복 방지
  notifiedTabs: Record<string, boolean>;
  isLoggedIn: boolean;
}

const MAX_NET_ISSUES_PER_TAB = 20;

// 초기 스토리지 데이터
const initialStorageData: StorageData = {
  notificationsEnabled: true,
  lastAnalysisResults: {},
  urlIssues: {},
  jsIssues: {},
  networkIssues: {},
  notifiedTabs: {},
  isLoggedIn: false
};

// 확장프로그램 설치/업데이트 시
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set(initialStorageData);
});

// 탭 URL 변경 감지
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 새 페이지로 이동하면 이전 탭 결과를 초기화(이전 사이트 이슈 잔류 방지)
  if (changeInfo.url) {
    void clearTabState(tabId);
  }
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    // URL 휴리스틱(오프라인)은 즉시 실행
    void handleUrlAnalysis(tabId, tab.url);
    chrome.tabs.sendMessage(tabId, { type: 'REQUEST_ANALYSIS' }).catch(() => {
      // content script 미주입 페이지(chrome:// 등) — 무시
    });
  }
});

// 탭 종료 시 상태 정리(스토리지 누수 방지)
chrome.tabs.onRemoved.addListener((tabId) => {
  void clearTabState(tabId);
});

// contentScript로부터의 분석 결과 처리
chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
  if (message.type === 'JS_ANALYSIS_RESULT') {
    void handleAnalysisResult(message.data.issues, sender.tab?.id);
  }
  return true;
});

// 네트워크(교차 사이트 전송) 모니터링 시작
startNetworkMonitoring((finding) => {
  void handleNetworkFinding(finding);
});

// 내용 기준 중복 제거
function dedupe(issues: JSIssue[]): JSIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.type}|${i.description}|${i.location ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// URL 휴리스틱(오프라인) 저장 → 병합 재계산
async function handleUrlAnalysis(tabId: number, url: string) {
  const { issues } = analyzeUrl(url);
  const { urlIssues } = await chrome.storage.local.get('urlIssues');
  const next = { ...(urlIssues || {}), [tabId]: issues };
  await chrome.storage.local.set({ urlIssues: next });
  await recompute(tabId);
}

// JS 분석 결과 저장 → 병합 재계산
async function handleAnalysisResult(issues: JSIssue[], tabId?: number) {
  if (!tabId) return;
  const { jsIssues } = await chrome.storage.local.get('jsIssues');
  const next = { ...(jsIssues || {}), [tabId]: issues };
  await chrome.storage.local.set({ jsIssues: next });
  await recompute(tabId);
}

// 네트워크 발견 누적 → 병합 재계산
async function handleNetworkFinding(finding: NetworkFinding) {
  const { tabId, issue } = finding;
  if (tabId < 0) return;

  const { networkIssues } = await chrome.storage.local.get('networkIssues');
  const current: JSIssue[] = (networkIssues && networkIssues[tabId]) || [];
  const merged = dedupe([...current, issue]).slice(-MAX_NET_ISSUES_PER_TAB);

  const next = { ...(networkIssues || {}), [tabId]: merged };
  await chrome.storage.local.set({ networkIssues: next });
  await recompute(tabId);
}

// 소스별 이슈를 병합해 lastAnalysisResults 갱신 + 뱃지/알림 처리
async function recompute(tabId: number) {
  const { urlIssues, jsIssues, networkIssues, lastAnalysisResults } =
    await chrome.storage.local.get(['urlIssues', 'jsIssues', 'networkIssues', 'lastAnalysisResults']);

  const url: JSIssue[] = (urlIssues && urlIssues[tabId]) || [];
  const js: JSIssue[] = (jsIssues && jsIssues[tabId]) || [];
  const net: JSIssue[] = (networkIssues && networkIssues[tabId]) || [];
  const merged = dedupe([...url, ...js, ...net]);

  await chrome.storage.local.set({
    lastAnalysisResults: { ...(lastAnalysisResults || {}), [tabId]: merged }
  });

  const hasHighRisk = merged.some((i) => i.severity === 'high');
  if (hasHighRisk) {
    await maybeNotify(tabId, merged);
  }
  await updateBadge(tabId, merged);
}

// 탭 상태 전체 초기화
async function clearTabState(tabId: number) {
  const { urlIssues, jsIssues, networkIssues, lastAnalysisResults, notifiedTabs } =
    await chrome.storage.local.get(['urlIssues', 'jsIssues', 'networkIssues', 'lastAnalysisResults', 'notifiedTabs']);

  for (const store of [urlIssues, jsIssues, networkIssues, lastAnalysisResults, notifiedTabs]) {
    if (store) delete store[tabId];
  }
  await chrome.storage.local.set({ urlIssues, jsIssues, networkIssues, lastAnalysisResults, notifiedTabs });
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
}

// 탭당 1회만 알림(스팸 방지). 페이지 이동 시 clearTabState 로 플래그가 초기화된다.
async function maybeNotify(tabId: number, issues: JSIssue[]) {
  const { notificationsEnabled, notifiedTabs } =
    await chrome.storage.local.get(['notificationsEnabled', 'notifiedTabs']);
  if (!notificationsEnabled) return;
  if (notifiedTabs && notifiedTabs[tabId]) return;

  const highCount = issues.filter((i) => i.severity === 'high').length;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '/icons/danger-icon.png',
    title: '보안 위험 감지',
    message: `${highCount}개의 높은 위험 신호가 감지되었습니다.`
  });

  await chrome.storage.local.set({ notifiedTabs: { ...(notifiedTabs || {}), [tabId]: true } });
}

// 뱃지 업데이트
async function updateBadge(tabId: number, issues: JSIssue[]) {
  const highRiskCount = issues.filter((issue) => issue.severity === 'high').length;

  if (highRiskCount > 0) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#FF0000' });
    chrome.action.setBadgeText({ tabId, text: highRiskCount.toString() });
  } else if (issues.some((i) => i.severity === 'medium')) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#FFA500' });
    chrome.action.setBadgeText({ tabId, text: '!' });
  } else {
    // low 신호만 있으면 뱃지를 띄우지 않는다(오탐 체감 축소)
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}
