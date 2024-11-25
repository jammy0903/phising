import React, { useState, useEffect } from 'react';
import { Mail, Phone, Clock, History } from 'lucide-react';

interface TempDataItem {
  id: string;
  type: 'email' | 'phone';
  value: string;
  createdAt: Date;
  expiresAt: Date;
  messages: Message[];
  site?: string;
}

interface Message {
  id: string;
  content: string;
  receivedAt: Date;
  from?: string;
}

interface DurationOption {
  id: '30min' | '1hour' | '1day' | '7days';
  label: string;
  price: string;
  milliseconds: number;
}

const DURATION_OPTIONS: DurationOption[] = [
  { id: '30min', label: '30분', price: '1,000원', milliseconds: 30 * 60 * 1000 },
  { id: '1hour', label: '1시간', price: '1,500원', milliseconds: 60 * 60 * 1000 },
  { id: '1day', label: '1일', price: '3,000원', milliseconds: 24 * 60 * 60 * 1000 },
  { id: '7days', label: '7일', price: '10,000원', milliseconds: 7 * 24 * 60 * 60 * 1000 }
];

const TempData: React.FC = () => {
  const [selectedDuration, setSelectedDuration] = useState<DurationOption['id']>('30min');
  const [activeData, setActiveData] = useState<TempDataItem[]>([]);
  const [history, setHistory] = useState<TempDataItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 초기 데이터 로드
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await chrome.storage.local.get(['tempDataHistory', 'activeData']);
        if (data.tempDataHistory) setHistory(data.tempDataHistory);
        if (data.activeData) setActiveData(data.activeData);
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    
    loadData();
  }, []);

  // 데이터 생성 함수
  const generateTempData = async (type: 'email' | 'phone') => {
    setIsLoading(true);
    try {
      const duration = DURATION_OPTIONS.find(opt => opt.id === selectedDuration)!;
      const currentUrl = await getCurrentTab();
      
      // 서비스 호출
      const response = type === 'email' 
        ? await chrome.runtime.sendMessage({
            type: 'GENERATE_EMAIL',
            duration: duration.milliseconds
          })
        : await chrome.runtime.sendMessage({
            type: 'GENERATE_PHONE',
            duration: duration.milliseconds
          });

      if (response.success) {
        const newData: TempDataItem = {
          id: crypto.randomUUID(),
          type,
          value: response.value,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + duration.milliseconds),
          messages: [],
          site: currentUrl
        };

        setActiveData(prev => [...prev, newData]);
        
        // 스토리지 업데이트
        await chrome.storage.local.set({
          activeData: [...activeData, newData]
        });
      }
    } catch (error) {
      console.error('Failed to generate temp data:', error);
      // TODO: 에러 처리 UI 추가
    }
    setIsLoading(false);
  };

  // 현재 탭 URL 가져오기
  const getCurrentTab = async (): Promise<string> => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.url || '';
  };

  // 남은 시간 계산
  const getTimeRemaining = (expiresAt: Date): string => {
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return '만료됨';
    
    const minutes = Math.floor(remaining / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}일 남음`;
    }
    if (hours > 0) return `${hours}시간 ${minutes % 60}분 남음`;
    return `${minutes}분 남음`;
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">임시 데이터 생성</h1>
        <p className="text-gray-600">안전한 임시 이메일과 전화번호를 생성하세요</p>
      </div>

      {/* 유효기간 선택 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          <span className="font-medium">유효기간 선택</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={`p-3 rounded border text-center ${
                selectedDuration === option.id ? 'border-blue-600 bg-blue-50' : 'hover:bg-gray-50'
              }`}
              onClick={() => setSelectedDuration(option.id)}
              disabled={isLoading}
            >
              <div className="font-medium">{option.label}</div>
              <div className="text-sm text-gray-600">{option.price}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 데이터 생성 버튼 */}
      <div className="grid grid-cols-2 gap-4">
        <button
          className="flex items-center justify-center gap-2 p-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
          onClick={() => generateTempData('email')}
          disabled={isLoading}
        >
          <Mail className="w-5 h-5" />
          <span>임시 이메일 생성</span>
        </button>
        <button
          className="flex items-center justify-center gap-2 p-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
          onClick={() => generateTempData('phone')}
          disabled={isLoading}
        >
          <Phone className="w-5 h-5" />
          <span>임시 전화번호 생성</span>
        </button>
      </div>

      {/* 활성화된 데이터 표시 */}
      <div className="space-y-3">
        <h2 className="font-medium">생성된 데이터</h2>
        <div className="space-y-2">
          {activeData.map((data) => (
            <div key={data.id} className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {data.type === 'email' ? <Mail className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                  <span className="font-medium">{data.value}</span>
                </div>
                <span className="text-sm text-gray-600">
                  {getTimeRemaining(data.expiresAt)}
                </span>
              </div>
              <div className="bg-gray-50 rounded p-2 max-h-32 overflow-y-auto">
                {data.messages.length > 0 ? (
                  data.messages.map(message => (
                    <div key={message.id} className="text-sm mb-2">
                      <div className="text-gray-600">{message.from}</div>
                      <div>{message.content}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(message.receivedAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">수신된 메시지가 없습니다</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 사용 기록 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5" />
          <h2 className="font-medium">사용 기록</h2>
        </div>
        <div className="space-y-2">
          {history.map((item) => (
            <div key={item.id} className="p-3 border rounded-lg flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {item.type === 'email' ? <Mail className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                  <span className="font-medium">{item.value}</span>
                </div>
                {item.site && (
                  <div className="text-sm text-gray-600">사용 사이트: {item.site}</div>
                )}
              </div>
              <div className="text-sm text-gray-600">
                <div>{new Date(item.createdAt).toLocaleDateString()}</div>
                <div>{DURATION_OPTIONS.find(opt => 
                  opt.milliseconds === (new Date(item.expiresAt).getTime() - new Date(item.createdAt).getTime())
                )?.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TempData;