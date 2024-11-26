import React from 'react';
import { createRoot } from 'react-dom/client';
import { AnalysisPage } from './analysis';
import '../../styles/global.css';

const suspiciousResult = {
    status: 'danger' as const,
    url: 'https://www.yesnoif.com/',
    issues: [
        {
            type: 'MALICIOUS_URL',
            description: 'URLhaus에서 악성 URL로 탐지됨: 피싱',
            severity: 'high',
            source: 'url'
        }
    ],
    analysisDetails: {
        urlAnalysis: {
            status: 'malicious',
            threat: '피싱/사기',
            issues: [
                'URLhaus에서 악성 URL로 탐지됨',
                'DNS 블랙리스트에 등록된 도메인',
                '최근 7일 이내 생성된 의심스러운 도메인',
                'SSL 인증서 유효하지 않음'
            ]
        },
        companyInfo: {
            businessStatus: '조회불가',
            statusCode: null,
            taxType: null,
            taxTypeCode: null,
            issues: [
                '유효하지 않은 사업자 번호',
                '사업자 정보 확인 불가'
            ]
        },
        jsAnalysis: {
            issues: [
                {
                    type: 'keylogger',
                    severity: 'high',
                    description: '키보드 입력을 감시하는 코드가 발견되었습니다.',
                    location: 'Line 45'
                },
                {
                    type: 'formHijacking',
                    severity: 'high',
                    description: '폼 데이터를 가로채는 코드가 발견되었습니다.',
                    location: 'Line 78'
                },
                {
                    type: 'dataExfiltration',
                    severity: 'high',
                    description: '데이터 유출 시도가 감지되었습니다.',
                    location: 'Line 92'
                },
                {
                    type: 'obfuscation',
                    severity: 'medium',
                    description: '의심스러운 코드 난독화가 발견되었습니다.',
                    location: 'Multiple locations'
                }
            ],
            detectedPatterns: [
                {
                    pattern: 'keylogger',
                    count: 3,
                    risk: 0.9
                },
                {
                    pattern: 'formHijacking',
                    count: 2,
                    risk: 0.85
                }
            ]
        },
        uiAnalysis: {
            issues: [
                '가짜 로그인 폼 감지',
                '숨겨진 데이터 수집 필드 발견'
            ]
        }
    },
    lastChecked: new Date().toISOString()
};

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <AnalysisPage result={suspiciousResult} />
    </React.StrictMode>
);