import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnalysisPage } from './analysis';
import type { DetailResult } from '@utils/api/types';
import '../../styles/global.css';

// 팝업이 분석 시 chrome.storage.local 의 detailResults[tabId] 에 저장한 결과를 읽어
// 그대로 렌더링한다. (상세 페이지는 새 탭이라 원본 페이지 HTML 에 접근할 수 없으므로
// 여기서 재분석하지 않고 저장된 결과를 사용한다)
const AnalysisBootstrap: React.FC = () => {
    const [result, setResult] = useState<DetailResult | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const tabId = new URLSearchParams(window.location.search).get('tabId');
        chrome.storage.local.get('detailResults', (data) => {
            const results = data.detailResults || {};
            const found: DetailResult | undefined = tabId ? results[tabId] : undefined;
            setResult(found ?? null);
            setLoading(false);
        });
    }, []);

    if (loading) {
        return <div className="container mx-auto p-6 text-gray-500">분석 결과를 불러오는 중…</div>;
    }

    if (!result) {
        return (
            <div className="container mx-auto p-6 max-w-2xl">
                <h1 className="text-2xl font-bold mb-3">분석 결과</h1>
                <p className="text-gray-600">
                    표시할 분석 데이터가 없습니다. 확장 아이콘(팝업)에서 분석을 먼저 실행한 뒤
                    “자세히 보기”를 눌러 주세요.
                </p>
            </div>
        );
    }

    return <AnalysisPage result={result} />;
};

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <AnalysisBootstrap />
    </React.StrictMode>
);
