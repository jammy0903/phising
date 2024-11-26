import React from 'react';
import { LogIn, CreditCard, FileText, ExternalLink, Clock, Mail, Phone } from 'lucide-react';
import { DURATION_OPTIONS, tempDataService } from '@services/tempDataService';
import type { DurationType } from '@utils/api/types';

interface SubscriptionInfo {
  type: 'free' | 'basic' | 'premium';
  expiryDate?: string;
}

const Options: React.FC = () => {
  // 상태 관리
  const [isLoggedIn, setIsLoggedIn] = React.useState<boolean>(false);
  const [subscriptionInfo] = React.useState<SubscriptionInfo>({
    type: 'free'
  });
  const [isTempDataModalOpen, setIsATempDataModalOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [selectedDuration, setSelectedDuration] = React.useState<DurationType>('ONE_HOUR');
  const [error, setError] = React.useState<string | null>(null);

  // 핸들러 함수들
  const handleLogin = React.useCallback(() => {
    window.open('https://your-auth-url.com', '_blank', 'noopener,noreferrer');
  }, []);

  const handleSubscriptionChange = React.useCallback(() => {
    window.open('https://your-subscription-url.com', '_blank', 'noopener,noreferrer');
  }, []);

  const handleLogout = React.useCallback(() => {
    setIsLoggedIn(false);
  }, []);

  const handleGenerateEmail = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await tempDataService.generateTempEmail(selectedDuration);
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '임시 이메일 생성 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePhone = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await tempDataService.generateTempPhone(DURATION_OPTIONS[selectedDuration]);
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '임시 전화번호 생성 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* 헤더 */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">설정</h1>
          <p className="text-gray-600">계정 및 서비스 관리</p>
        </div>

        {/* 로그인 섹션 */}
        <div className="p-4 border rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LogIn className="w-5 h-5" />
              <span className="font-medium">로그인</span>
            </div>
            {!isLoggedIn ? (
                <button
                    onClick={handleLogin}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    type="button"
                >
                  로그인
                </button>
            ) : (
                <div className="flex items-center gap-4">
                  <span className="text-gray-600">user@example.com</span>
                  <button
                      onClick={handleLogout}
                      className="px-4 py-2 border rounded hover:bg-gray-50 transition-colors"
                      type="button"
                  >
                    로그아웃
                  </button>
                </div>
            )}
          </div>
        </div>

        {/* 임시 데이터 생성 섹션 */}
        <div className="p-4 border rounded-lg space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            <span className="font-medium">임시 데이터 생성</span>
          </div>
          <div className="space-y-4">
            {/* 기간 선택 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                <Clock className="inline-block w-4 h-4 mr-2" />
                유효 기간
              </label>
              <select
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(e.target.value as DurationType)}
                  className="w-full p-2 border rounded"
              >
                <option value="THIRTY_MINS">30분</option>
                <option value="ONE_HOUR">1시간</option>
                <option value="ONE_DAY">1일</option>
                <option value="SEVEN_DAYS">7일</option>
              </select>
            </div>

            {/* 버튼 그룹 */}
            <div className="space-y-2">
              <button
                  onClick={handleGenerateEmail}
                  disabled={loading}
                  className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <Mail className="inline-block w-4 h-4 mr-2" />
                임시 이메일 생성
              </button>

              <button
                  onClick={handleGeneratePhone}
                  disabled={loading}
                  className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <Phone className="inline-block w-4 h-4 mr-2" />
                임시 전화번호 생성
              </button>
            </div>

            {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-600 rounded">
                  {error}
                </div>
            )}
          </div>
        </div>

        {/* 구독 관리 */}
        <div className="p-4 border rounded-lg space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            <span className="font-medium">구독 관리</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span>현재 요금제</span>
              <span className="font-medium capitalize">{subscriptionInfo.type}</span>
            </div>
            {subscriptionInfo.expiryDate && (
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span>만료일</span>
                  <span className="font-medium">{subscriptionInfo.expiryDate}</span>
                </div>
            )}
            <button
                onClick={handleSubscriptionChange}
                className="w-full px-4 py-2 border rounded hover:bg-gray-50 transition-colors"
                type="button"
            >
              요금제 변경
            </button>
          </div>
        </div>

        {/* 약관 및 정책 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            <span className="font-medium">약관 및 정책</span>
          </div>
          <div className="space-y-2">
            <a
                href="/privacy/cookies"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded transition-colors"
            >
              <span>쿠키 수집 동의</span>
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
                href="/privacy/policy"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded transition-colors"
            >
              <span>개인정보 처리방침</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* 버전 정보 */}
        <div className="pt-6 text-center text-sm text-gray-500">
          <p>버전 1.0.0</p>
        </div>
      </div>
  );
};

export default Options;
