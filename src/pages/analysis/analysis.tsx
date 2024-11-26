import React from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { DetailResult } from '@utils/api/types';
type Status = 'safe' | 'warning' | 'danger';

interface ResultCardProps {
    title: string;
    status: Status;
    details?: string;
    issues?: string[];
}
const StatusBadge: React.FC<{ status: Status }> = ({ status }) => {
    const styles = {
        safe: "bg-green-100 text-green-800",
        warning: "bg-yellow-100 text-yellow-800",
        danger: "bg-red-100 text-red-800"
    };

    const icons = {
        safe: <CheckCircle className="w-4 h-4" />,
        warning: <AlertTriangle className="w-4 h-4" />,
        danger: <XCircle className="w-4 h-4" />
    };

    return (
        <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm ${styles[status]}`}>
      {icons[status]}
            {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
    );
};

const ResultCard: React.FC<ResultCardProps> = ({ title, status, details, issues }) => {
    return (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">{title}</h3>
                <StatusBadge status={status} />
            </div>
            {details && (
                <div className="text-gray-600 mb-2">{details}</div>
             )}
            {issues && issues.length > 0 && (
                <div className="mt-2">
                    <p className="font-medium mb-1">발견된 문제점:</p>
                    <ul className="list-disc list-inside text-sm text-gray-600">
                        {issues.map((issue, index) => (
                            <li key={index}>{issue}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export const AnalysisPage: React.FC<{ result: DetailResult }> = ({ result }) => {
    return (
        <div className="container mx-auto p-4 max-w-4xl">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">분석 결과</h1>
                <StatusBadge status={result.status} />
            </div>

            <div className="grid gap-6">
                {/* URL 분석 결과 */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">URL 분석</h2>
                    <ResultCard
                        title="URL 평판"
                        status={result.analysisDetails.urlAnalysis.status === 'malicious' ? 'danger' : 'safe'}
                        details={`위협 유형: ${result.analysisDetails.urlAnalysis.threat || '없음'}`}
                        issues={result.analysisDetails.urlAnalysis.issues}
                    />
                </section>

                {/* 회사 정보 분석 */}
                {result.analysisDetails.companyInfo.businessStatus && (
                    <section>
                        <h2 className="text-xl font-semibold mb-3">사업자 정보</h2>
                        <ResultCard
                            title="사업자 상태"
                            status={result.analysisDetails.companyInfo.issues.length > 0 ? 'danger' : 'safe'}
                            details={`사업자 상태: ${result.analysisDetails.companyInfo.businessStatus}`}
                            issues={result.analysisDetails.companyInfo.issues}
                        />
                    </section>
                )}

                {/* JavaScript 분석 */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">JavaScript 분석</h2>
                    <ResultCard
                        title="스크립트 검사"
                        status={result.analysisDetails.jsAnalysis.issues.length > 0 ? 'warning' : 'safe'}
                        details="악성 스크립트 패턴 검사 결과"
                        issues={result.analysisDetails.jsAnalysis.issues.map(issue => issue.description)}
                    />
                </section>

                {/* 분석 시간 */}
                <div className="text-sm text-gray-500 text-right mt-4">
                    마지막 검사: {new Date(result.lastChecked).toLocaleString()}
                </div>
            </div>
        </div>
    );
};

export default AnalysisPage;