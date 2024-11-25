// src/utils/api/types.ts

// src/utils/api/types.ts

// API 및 NTS 요청/응답 관련 타입들
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface NTSBusinessValidationRequest {
    b_no: string[];
    b_adr?: string;
}

export interface NTSBusinessStatusRequest {
    b_no: string[];
}

export interface NTSApiResponse {
    data: Array<{
        b_no: string;
        b_stt: string;
        b_stt_cd: string;
        tax_type: string;
        tax_type_cd: string;
        rbf_tax_type: string;
        rbf_tax_type_cd: string;
        valid: string;
    }>;
    status_code: string;
    request_cnt: number;
    valid_cnt: number;
}

// 회사 정보 관련 타입들
export interface ValidationResult {
    b_no: string;
    isValid: boolean;
    timestamp: number;
    details: {
        valid: string;
        b_stt: string;
        b_stt_cd: string;
        tax_type: string;
        tax_type_cd: string;
        rbf_tax_type: string;
        rbf_tax_type_cd: string;
    };
}

export interface CompanyAnalysisResult {
    details: {
        isValid: boolean;
        status: string;
        statusCode: string;
        taxType: string;
        taxTypeCode: string;
        isClosed: boolean;
    };
}

export interface CompanyDetails {
    businessStatus: string | null;
    statusCode: string | null;
    taxType: string | null;
    taxTypeCode: string | null;
    issues: string[];
}

// 분석 결과 타입들
export interface DetailResult {
    url: string;
    status: 'safe' | 'warning' | 'danger';
    issues: Issue[];
    analysisDetails: {
        urlAnalysis: {
            threat?: string;
            status: 'malicious' | 'safe';  // 명확한 타입 지정
            issues: string[];
        };
        companyInfo: {
            businessStatus: string | null;  // null 허용
            statusCode: string | null;      // null 허용
            taxType: string | null;         // null 허용
            taxTypeCode: string | null;     // null 허용
            issues: string[];
        };
        jsAnalysis: {
            issues: JSIssue[];
            detectedPatterns: DetectedPattern[];
        };
        uiAnalysis: {
            issues: string[];
        };
    };
    lastChecked: string;
}
// Safe Browsing API 관련 타입
export interface ThreatEntry {
    url: string;
}

export interface ThreatInfo {
    threatTypes: string[];
    platformTypes: string[];
    threatEntryTypes: string[];
    threatEntries: ThreatEntry[];
}

export interface SafeBrowsingRequest {
    client: {
        clientId: string;
        clientVersion: string;
    };
    threatInfo: ThreatInfo;
}

export interface SafeBrowsingResponse {
    matches?: Array<{
        threatType: string;
        platformType: string;
        threat: ThreatEntry;
        cacheDuration: string;
        threatEntryType: string;
    }>;
    isMalicious: boolean;
    threats: string[];
}

// URLhaus 관련 타입
export interface URLHausResponse {
    query_status: string;
    url_info: {
        url: string;
        url_status: string;
        threat: string | null;
        host: string;
        date_added: string;
        blacklists: {
            spamhaus_dbl: string;
            surbl: string;
        };
    };
    id: string;
    threat?: string;  // 이 속성 추가
    status?: string;  // 이 속성도 필요할 수 있음
}

export interface URLHausError {
    query_status: string;
    error_message: string;
}

// SSL 인증서 정보
export interface SSLCertInfo {
    issuer: string;
    validFrom: string;
    validTo: string;
    isValid: boolean;
}

// 도메인 분석 결과
// src/utils/api/types.ts

export interface DomainAnalysisResult {
    urlhaus: {
        isMalicious: boolean;
        threatType?: string;
    };
    safeBrowsing: {
        isMalicious: boolean;
        threats: string[];
    };
    ssl: SSLCertInfo;
    dnsbl: {
        isListed: boolean;
        listedOn: string[];
    };
    surbl: {
        isListed: boolean;
        listedOn: string[];
    };
}

//////////email types

export const DURATION_OPTIONS = {
    THIRTY_MINS: 30 * 60 * 1000,  // 30분
    ONE_HOUR: 60 * 60 * 1000,     // 1시간
    ONE_DAY: 24 * 60 * 60 * 1000, // 1일
    SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000 // 7일
} as const;
// 이메일 메시지 타입
export interface EmailMessage {
    id: string;
    from: string;
    to: string;
    subject: string;
    body: string;
    timestamp: Date;
}

// SMS 메시지 타입
export interface SMSMessage {
    id: string;
    from: string;
    content: string;
    receivedAt: Date;
}

// 임시 이메일 데이터
export interface TempEmailData {
    email: string;
    expiresAt: Date;
    messages: EmailMessage[];
    status: 'active' | 'expired';
    createdAt: Date;
}

// 임시 전화번호 데이터
export interface TempPhoneData {
    phone: string;
    expiresAt: Date;
    messages: SMSMessage[];
    status: 'active' | 'expired';
    createdAt: Date;
}

// 서비스 응답 타입
export interface TempDataServiceResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

type Status = 'safe' | 'warning' | 'danger';

export interface ResultCardProps {
    title: string;
    status: Status;
    details?: string;
    issues?: string[];
}

export type DurationType = keyof typeof DURATION_OPTIONS;


//////////////////////////////// JS 분석 관련 타입들
export type Severity = 'high' | 'medium' | 'low';

export interface JSAnalysisResult {
    issues: JSIssue[];
    patterns: DetectedPattern[];
}

export interface JSIssue {
    type: PatternType;
    severity: Severity;
    description: string;
    location?: string;
}

export interface DetectedPattern {
    pattern: string;
    count: number;
    risk: number;
}

// 분석 결과를 위한 통합 인터페이스
export interface AnalysisResults {
    js: JSAnalysisResult;
    domain: DomainAnalysisResult;
    company: CompanyAnalysisResult;
}

// src/types/analysis.ts
export interface Issue {
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    source: 'url' | 'company' | 'javascript' | 'ui';
}




// types.ts
export type PatternType =
    | 'browserExploit'
    | 'dataExfiltration'
    | 'xss'
    | 'keylogger'
    | 'formHijacking'
    | 'redirect'
    | 'obfuscation'
    | 'communication'
    | 'security'
    | 'worker'
    | 'api_usage';


export interface JSIssue {
    type: PatternType;
    severity: Severity;
    description: string;
    location?: string;
}

export interface APIMonitorConfig {
    obj: any;
    props: string[];
}



