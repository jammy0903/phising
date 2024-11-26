import React, { useState, useEffect} from 'react';
import { AlertCircle, Shield, Mail, Phone, RefreshCcw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { tempDataService } from '@services/tempDataService';
import { analysisService } from '@services/analysisService';
import { DetailResult, TempEmailData, TempPhoneData, } from '@utils/api/types';

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
  const [analysisResult, setAnalysisResult] = useState<DetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tempEmail, setTempEmail] = useState<TempEmailData | null>(null);
  const [tempPhone, setTempPhone] = useState<TempPhoneData | null>(null);

  useEffect(() => {
    checkCurrentTab();
  }, []);

  const checkCurrentTab = async () => {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab?.url) {
        setError('URL을 찾을 수 없습니다.');
        return;
      }

      setCurrentUrl(tab.url);

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

      const [{result}] = await chrome.scripting.executeScript({
        target: {tabId: tab.id!},
        func: () => document.documentElement.innerHTML,
      });

      const analysis = await analysisService.analyzeURL(tab.url, result);
      setAnalysisResult(analysis);
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

        {/* Analysis Results */}
        {analysisResult && (
            <div className="grid grid-cols-2 gap-3">
              <ResultCard
                  title="URL"
                  status={analysisResult.analysisDetails.urlAnalysis.status === 'malicious' ? 'danger' : 'safe'}
                  description={getStatusDescription('URL', analysisResult.status)}
              />
              <ResultCard
                  title="행동"
                  status={analysisResult.analysisDetails.jsAnalysis.issues.length > 0 ? 'danger' : 'safe'}
                  description={getStatusDescription('JS', analysisResult.status)}
              />
              <ResultCard
                  title="사업자"
                  status={analysisResult.analysisDetails.companyInfo.issues.length > 0 ? 'warning' : 'safe'}
                  description={getStatusDescription('Company', analysisResult.status)}
              />
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
        <button
            onClick={() => chrome.tabs.create({url: 'options.html'})}
            className="mt-2 w-full p-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium hover:from-blue-600 hover:to-blue-700"
        >
          자세히 보기
        </button>

        {/* Report Button */}
        <ReportButton />
      </div>
  );
};

export default PopupUI;
