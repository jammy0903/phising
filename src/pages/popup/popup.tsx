import React, { useState, useEffect} from 'react';
import { AlertCircle, Shield, Mail, Phone, RefreshCcw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { tempDataService } from '@services/tempDataService';
import { analysisService } from '@services/analysisService';
import { DetailResult, TempEmailData, TempPhoneData, JSIssue, Severity } from '@utils/api/types';
import { gradeIssues } from '@utils/grade';

// 상태 뱃지 컴포넌트
const StatusBadge = ({ type }: { type: 'safe' | 'warning' | 'danger' }) => {
  const styles = {
    safe: "bg-green-100 text-green-800 border-green-200",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
    danger: "bg-red-100 text-red-200 border-red-200",
  };

  const labels = {
    safe: '안전',
    warning: '주의',
    danger: '위험',
  };

  return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${styles[type]}`}>
      {labels[type]}
    </span>
  );
};

// 결과 카드 컴포넌트
const ResultCard = ({
                      title,
                      status,
                      description,
                    }: {
  title: string;
  status: 'safe' | 'warning' | 'danger';
  description: string;
}) => {
  const statusColors = {
    safe: 'bg-green-500',
    warning: 'bg-yellow-500',
    danger: 'bg-red-500',
  };

  return (
      <div className="p-3 rounded-xl bg-gradient-to-br from-white to-gray-50 border shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full ${statusColors[status]}`}></div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className="text-xs text-gray-600">{description}</p>
      </div>
  );
};

// 리포트 버튼 컴포넌트
const ReportButton = () => {
  return (
      <button
          className="w-full px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-bold text-base
             rounded-lg transition-colors duration-300 cursor-pointer"
          onClick={() => chrome.tabs.create({url: "https://ecrm.police.go.kr/minwon/main"})}
      >
        피싱 사이트 신고하기
      </button>
  );
};

// 팝업 UI 컴포넌트
const PopupUI = () => {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [analysisResult, setAnalysisResult] = useState<DetailResult | null>(null);
  // background 가 모은 병합 결과(URL 휴리스틱 + JS 분석 + 네트워크 모니터링)
  const [bgIssues, setBgIssues] = useState<JSIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tempEmail, setTempEmail] = useState<TempEmailData | null>(null);
  const [tempPhone, setTempPhone] = useState<TempPhoneData | null>(null);
  const [analysisPath, setAnalysisPath] = useState<string>('analysis.html');

  useEffect(() => {
    checkCurrentTab();
    // build-info.json에서 분석 페이지 경로 가져오기
    fetch(chrome.runtime.getURL('build-info.json'))
        .then(response => response.json())
        .then(buildInfo => {
          setAnalysisPath(buildInfo.analysisPage);
        })
        .catch(error => {
          console.error('Failed to load build info:', error);
          // 에러 시 기본값 사용
        });
  }, []);

  const checkCurrentTab = async () => {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab?.url) {
        setError('URL을 찾을 수 없습니다.');
        return;
      }

      setCurrentUrl(tab.url);
      setCurrentTabId(tab.id ?? null);

      // chrome:// URL 확인
      if (tab.url.startsWith('chrome://')) {
        setError('Chrome 시스템 페이지는 분석할 수 없습니다.\n임시 데이터 생성은 계속 사용하실 수 있습니다.');
        return;
      }

      // 정상적인 URL일 경우 분석 실행
      analyzeCurrentPage();
    } catch (err) {
      setError('탭 정보를 가져오는데 실패했습니다.');
    }
  };

  const analyzeCurrentPage = async () => {
    setLoading(true);
    setError(null);

    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab.url) throw new Error('URL not found');

      // background 가 모아둔 병합 결과(수동 분석과 별개로 상시 수집됨)를 먼저 읽는다
      if (tab.id != null) {
        try {
          const { lastAnalysisResults } = await chrome.storage.local.get('lastAnalysisResults');
          setBgIssues((lastAnalysisResults && lastAnalysisResults[tab.id]) || []);
        } catch {
          /* 스토리지 접근 실패는 무시 */
        }
      }

      const [{result}] = await chrome.scripting.executeScript({
        target: {tabId: tab.id!},
        func: () => document.documentElement.innerHTML,
      });

      const analysis = await analysisService.analyzeURL(tab.url, result);

      // background 상시수집 이슈(URL 휴리스틱/네트워크 등)를 심층분석 결과에 병합
      let storedBg: JSIssue[] = [];
      if (tab.id != null) {
        try {
          const { lastAnalysisResults } = await chrome.storage.local.get('lastAnalysisResults');
          storedBg = (lastAnalysisResults && lastAnalysisResults[tab.id]) || [];
        } catch { /* 무시 */ }
      }
      const mergedJs = [...analysis.analysisDetails.jsAnalysis.issues, ...storedBg];
      const combinedStatus = gradeIssues([...analysis.issues, ...storedBg]).status;
      const detail: DetailResult = {
        ...analysis,
        status: combinedStatus,
        analysisDetails: {
          ...analysis.analysisDetails,
          jsAnalysis: { ...analysis.analysisDetails.jsAnalysis, issues: mergedJs },
        },
      };

      setAnalysisResult(detail);

      // 상세 페이지(새 탭)가 읽을 수 있도록 탭별로 저장
      if (tab.id != null) {
        try {
          const { detailResults } = await chrome.storage.local.get('detailResults');
          await chrome.storage.local.set({
            detailResults: { ...(detailResults || {}), [tab.id]: detail },
          });
        } catch { /* 무시 */ }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const generateTempEmail = async () => {
    try {
      const response = await tempDataService.generateTempEmail('ONE_HOUR');
      if (response.success && response.data) {
        setTempEmail(response.data);
      }
    } catch (err) {
      setError('임시 이메일 생성 실패');
    }
  };

  const generateTempPhone = async () => {
    try {
      const response = await tempDataService.generateTempPhone(3600000);
      if (response.success && response.data) {
        setTempPhone(response.data);
      }
    } catch (err) {
      setError('임시 전화번호 생성 실패');
    }
  };

  const getStatusDescription = (type: string, status: 'safe' | 'warning' | 'danger') => {
    const descriptions = {
      URL: {
        safe: '안전한 도메인입니다',
        warning: '의심스러운 도메인입니다',
        danger: '위험한 도메인입니다',
      },
      JS: {
        safe: '안전한 페이지입니다',
        warning: '의심스러운 동작이 감지되었습니다',
        danger: '악성 행동이 감지되었습니다',
      },
      Company: {
        safe: '신뢰할 수 있는 사업자입니다',
        warning: '확인이 필요한 사업자입니다',
        danger: '확인되지 않은 사업자입니다',
      },
    };

    return descriptions[type as keyof typeof descriptions]?.[status] || '분석 결과를 확인하세요';
  };

  // 수동 심층분석(analysisResult)과 background 상시수집(bgIssues)을 합쳐 종합 등급 산출
  const combinedIssues: ReadonlyArray<{ severity: Severity; description: string }> = [
    ...((analysisResult?.issues ?? []) as { severity: Severity; description: string }[]),
    ...bgIssues.map((i) => ({ severity: i.severity, description: i.description })),
  ];
  const overall = gradeIssues(combinedIssues);
  const sevDot: Record<Severity, string> = {
    high: 'bg-red-500',
    medium: 'bg-yellow-500',
    low: 'bg-gray-400',
  };

  return (
      <div className="w-80 p-4 flex flex-col gap-4 bg-white">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600"/>
            <span className="font-semibold text-lg">피싱 체크</span>
          </div>
          <button
              onClick={checkCurrentTab}
              className="p-1 hover:bg-gray-100 rounded-full"
          >
            <RefreshCcw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`}/>
          </button>
        </div>

        {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4"/>
              <AlertTitle>오류</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}

        {/* 종합 판정 — URL 휴리스틱 + JS 분석 + 네트워크 모니터링 + 심층분석 병합 */}
        {!loading && !error && (
            <div className="p-3 rounded-xl bg-gradient-to-br from-white to-gray-50 border shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">종합 판정</span>
                <StatusBadge type={overall.status} />
              </div>
              <div className="text-xs text-gray-600 mb-2">
                위험 {overall.high} · 주의 {overall.medium} · 참고 {overall.low}
              </div>
              {combinedIssues.length === 0 ? (
                  <p className="text-xs text-gray-500">특이 신호가 감지되지 않았습니다.</p>
              ) : (
                  <ul className="space-y-1 max-h-40 overflow-auto">
                    {combinedIssues.slice(0, 10).map((issue, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-gray-700">
                          <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${sevDot[issue.severity]}`}></span>
                          <span>{issue.description}</span>
                        </li>
                    ))}
                    {combinedIssues.length > 10 && (
                        <li className="text-xs text-gray-400">… 외 {combinedIssues.length - 10}건</li>
                    )}
                  </ul>
              )}
            </div>
        )}

        {/* Temporary Data Generation */}
        <div className="flex gap-2">
          <button
              onClick={generateTempEmail}
              className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <Mail className="w-4 h-4 text-blue-600"/>
            <span className="text-sm text-blue-700">임시 메일</span>
          </button>
          <button
              onClick={generateTempPhone}
              className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-purple-50 hover:bg-purple-100 transition-colors"
          >
            <Phone className="w-4 h-4 text-purple-600"/>
            <span className="text-sm text-purple-700">임시 번호</span>
          </button>
        </div>

        {/* Temporary Data Display */}
        {(tempEmail || tempPhone) && (
            <div className="mt-2 space-y-2 text-sm">
              {tempEmail && <div className="p-2 bg-blue-50 rounded">임시 이메일: {tempEmail.email}</div>}
              {tempPhone && <div className="p-2 bg-purple-50 rounded">임시 전화번호: {tempPhone.phone}</div>}
            </div>
        )}

        {/* Detailed Analysis Button */}
        <div className="space-y-2">  {/* 버튼들을 감싸는 컨테이너 */}
          <button
              onClick={() => {
                const base = chrome.runtime.getURL(analysisPath);
                const url = currentTabId != null ? `${base}?tabId=${currentTabId}` : base;
                chrome.tabs.create({ url });
              }}
              disabled={!analysisResult}
              className="mt-2 w-full p-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            자세히 보기
          </button>

          <button
              onClick={() => chrome.tabs.create({
                url: chrome.runtime.getURL(chrome.runtime.getManifest().options_page as string)
              })}
              className="mt-2 w-full p-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium hover:from-blue-600 hover:to-blue-700"
          >
            설정
          </button>
        </div>

        {/* Report Button */}

      </div>
  );
};

export default PopupUI;
