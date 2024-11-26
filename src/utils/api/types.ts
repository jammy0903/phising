// 기본 API 응답 타입
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// NTS API 요청 타입
export interface NTSBusinessValidationRequest {
    b_no: string[];
}

export interface NTSBusinessStatusRequest {
    b_no: string[];
}

// NTS API 응답 데이터 타입
export interface NTSBusinessData {
    b_no: string;                // 사업자번호
    valid: 'Y' | 'N';           // 유효여부
    b_stt: string;              // 납세자상태
    b_stt_cd: string;           // 납세자상태코드
    tax_type: string;           // 과세유형
    tax_type_cd: string;        // 과세유형코드
    rbf_tax_type: string;       // 면세과세유형
    rbf_tax_type_cd: string;    // 면세과세유형코드
    end_dt?: string;            // 폐업일자
}

// NTS API 응답 타입
export interface NTSApiResponse {
    data: NTSBusinessData[];
    status_code: string;
    request_cnt: number;
    valid_cnt: number;
}

// 검증 결과 캐시 타입
export interface ValidationResult {
    b_no: string;
    isValid: boolean;
    timestamp: number;
    details: {
        valid: 'Y' | 'N';           // 타입 수정
        b_stt: string;
        b_stt_cd: string;
        tax_type: string;
        tax_type_cd: string;
        rbf_tax_type: string;
        rbf_tax_type_cd: string;
    };
}

// 회사 분석 결과 타입
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

// 회사 세부 정보 타입
export interface CompanyDetails {
    businessStatus: string | null;
    statusCode: string | null;
    taxType: string | null;
    taxTypeCode: string | null;
    issues: string[];
}

// 도메인/URL 분석 관련
export interface URLHausResponse {
    url_info: {
        url: string;
        status: string;
    }
    query_status: string;
    threat?: string;
    status?: string;
    id: string;
}

export interface URLHausError {
    query_status: "no_results" | "invalid_url" | "error";
    error_message:string;
}
type URLHausResult = ApiResponse<URLHausResponse | URLHausError>;
export interface SafeBrowsingResponse {
    matches?: Array<{
        threatType: string;
        platformType: string;
        threat: { url: string };
    }>;
}

export interface SSLCertInfo {
    issuer: string;
    validFrom: string;
    validTo: string;
    isValid: boolean;
}

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

// 분석 이슈 타입
export type Severity = 'high' | 'medium' | 'low';
export type IssueSource = 'url' | 'company' | 'javascript' | 'ui';

export interface Issue {
    type: string;
    description: string;
    severity: Severity;
    source: IssueSource;
}

// 세부 분석 결과
export interface DetailResult {
    url: string;
    status: 'safe' | 'warning' | 'danger';
    issues: Issue[];
    analysisDetails: {
        urlAnalysis: {
            threat?: string;
            status: 'malicious' | 'safe';
            issues: string[];
        };
        companyInfo: CompanyDetails;
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

// JavaScript 분석 관련
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

export interface DetectedPattern {
    pattern: string;
    count: number;
    risk: number;
}

export interface JSAnalysisResult {
    issues: JSIssue[];
    patterns: DetectedPattern[];
}

// 회사 정보 관련
export interface CompanyDetails {
    businessStatus: string | null;
    statusCode: string | null;
    taxType: string | null;
    taxTypeCode: string | null;
    issues: string[];
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

// 임시 데이터 관련
export const DURATION_OPTIONS = {
    THIRTY_MINS: 30 * 60 * 1000,
    ONE_HOUR: 60 * 60 * 1000,
    ONE_DAY: 24 * 60 * 60 * 1000,
    SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000
} as const;

export type DurationType = keyof typeof DURATION_OPTIONS;

export interface EmailMessage {
    from: string;
    subject: string;
    body: string;
    receivedAt: Date;
}

export interface SMSMessage {
    from: string;
    body: string;
    receivedAt: Date;
}

export interface TempEmailData {
    email: string;
    expiresAt: Date;
    messages: EmailMessage[];
    status: 'active' | 'expired';
    createdAt: Date;
}

export interface TempPhoneData {
    phone: string;
    expiresAt: Date;
    messages: SMSMessage[];
    status: 'active' | 'expired';
    createdAt: Date;
}

export interface TempDataServiceResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface APIMonitorConfig {
    obj: any;
    props: string[];
}