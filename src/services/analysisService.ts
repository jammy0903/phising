//src/services/analysisService.ts

import {API_CONFIG, makeRequest} from '@utils/api/api';
import {
  ApiResponse,
  CompanyDetails,
  DetailResult,
  DomainAnalysisResult,
  Issue,
  SafeBrowsingResponse,
  SSLCertInfo,
  URLHausResponse
} from "@utils/api/types";
import {CompanyService} from './companyService';
import {JSAnalysisService} from './jsAnalysisService';
import {checkDnsbl, checkSurbl} from './dnsbl';

export class DomainAnalysisService {
  private readonly apiKey: string;
  private readonly safeBrowsingKey: string;
  private companyService: CompanyService;
  private jsAnalysisService: JSAnalysisService;

  constructor() {
    this.apiKey = process.env.URLHAUS_API_KEY || '';
    this.safeBrowsingKey = process.env.SAFE_BROWSING_API_KEY || '';
    this.companyService = new CompanyService();
    this.jsAnalysisService = new JSAnalysisService();
  }

  private determineStatus(issues: Issue[]): 'safe' | 'warning' | 'danger' {
    if (issues.some(issue => issue.severity === 'high')) return 'danger';
    if (issues.some(issue => issue.severity === 'medium')) return 'warning';
    return 'safe';
  }

  private async checkURLhaus(url: string): Promise<ApiResponse<URLHausResponse>> {
    // 키가 없으면 호출하지 않는다(실패가 뻔한 요청으로 콘솔을 더럽히지 않음).
    // abuse.ch URLhaus 는 Auth-Key 를 요구한다.
    if (!this.apiKey) {
      return { success: false, error: 'URLHAUS_API_KEY 미설정 — 조회 건너뜀' };
    }
    try {
      // URLhaus 는 JSON 이 아니라 application/x-www-form-urlencoded(`url=...`)를 받는다.
      return await makeRequest<URLHausResponse>(API_CONFIG.URLHAUSENDPOINT, {
        method: 'POST',
        headers: {
          'Auth-Key': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `url=${encodeURIComponent(url)}`
      });
    } catch (error) {
      console.error('URLhaus check failed:', error);
      return { success: false, error: 'URLhaus check failed' };
    }
  }

  private async checkSafeBrowsing(url: string): Promise<ApiResponse<SafeBrowsingResponse>> {
    // 키가 없으면 호출 생략(Safe Browsing 은 key 필수 → 없으면 400).
    if (!this.safeBrowsingKey) {
      return { success: false, error: 'SAFE_BROWSING_API_KEY 미설정 — 조회 건너뜀' };
    }
    try {
      const requestBody = {
        client: {
          clientId: "phishing-detector-extension",
          clientVersion: "1.0.0"
        },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }]
        }
      };

      return await makeRequest<SafeBrowsingResponse>(
          `${API_CONFIG.SAFE_BROWSING_ENDPOINT}?key=${this.safeBrowsingKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          }
      );
    } catch (error) {
      console.error('Safe Browsing check failed:', error);
      return { success: false, error: 'Safe Browsing check failed' };
    }
  }

  private async checkSSLCertificate(domain: string): Promise<SSLCertInfo> {
    try {
      const response = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`);
      if (!response.ok) throw new Error('Certificate lookup failed');

      const certData = await response.json();
      if (Array.isArray(certData) && certData.length > 0) {
        // crt.sh 는 과거 인증서까지 모두 반환하므로, 만료일이 가장 늦은 것을 고른다.
        // (certData[0] 을 그냥 쓰면 오래전 만료된 인증서를 보고 오탐할 수 있다)
        const latestCert = certData.reduce((latest: any, cur: any) =>
          new Date(cur.not_after) > new Date(latest.not_after) ? cur : latest
        );
        const now = new Date();
        const validTo = new Date(latestCert.not_after);

        return {
          issuer: latestCert.issuer_name,
          validFrom: latestCert.not_before,
          validTo: latestCert.not_after,
          isValid: validTo > now
        };
      }
      // 인증서를 못 찾음: 무효로 '단정'하지 않는다(조회 한계일 수 있음).
      return { issuer: 'Unknown (조회 결과 없음)', validFrom: '', validTo: '', isValid: true };
    } catch (error) {
      console.error('SSL check failed:', error);
      // 조회 실패 → 무효로 단정하면 정상 사이트를 오탐한다. fail-open.
      return { issuer: 'Unknown (조회 실패)', validFrom: '', validTo: '', isValid: true };
    }
  }

  public async analyzeDomain(url: string): Promise<DomainAnalysisResult> {
    try {
      const domain = new URL(url).hostname;

      const [urlhausResult, safeBrowsingResult, sslResult, dnsblResult, surblResult] = await Promise.all([
        this.checkURLhaus(url),
        this.checkSafeBrowsing(url),
        this.checkSSLCertificate(domain),
        checkDnsbl(domain),   // 실제 DoH 기반 조회 (이전 랜덤 시뮬레이션 제거됨)
        checkSurbl(domain)
      ]);

      return {
        urlhaus: {
          // URLhaus 는 등재 시 query_status='ok', 미등재 시 'no_results' 를 반환한다.
          isMalicious: urlhausResult.success && urlhausResult.data?.query_status === 'ok',
          threatType: urlhausResult.success
            ? (urlhausResult.data?.url_info?.threat ?? urlhausResult.data?.threat)
            : undefined
        },
        safeBrowsing: {
          isMalicious: safeBrowsingResult.success &&
              (safeBrowsingResult.data?.matches?.length ?? 0) > 0,
          threats: safeBrowsingResult.success ?
              (safeBrowsingResult.data?.matches?.map(m => m.threatType) ?? []) : []
        },
        ssl: sslResult,
        dnsbl: dnsblResult,
        surbl: surblResult
      };
    } catch (error) {
      console.error('Domain analysis failed:', error);
      throw error;
    }
  }


  private processDomainAnalysis(domainResult: DomainAnalysisResult): Issue[] {
    const issues: Issue[] = [];

    if (domainResult.urlhaus.isMalicious) {
      issues.push({
        type: 'MALICIOUS_URL',
        description: `URLhaus에서 악성 URL로 탐지됨${domainResult.urlhaus.threatType ? `: ${domainResult.urlhaus.threatType}` : ''}`,
        severity: 'high',
        source: 'url'
      });
    }

    if (domainResult.safeBrowsing.isMalicious) {
      issues.push({
        type: 'SAFE_BROWSING_THREAT',
        description: `Google Safe Browsing 위협 발견: ${domainResult.safeBrowsing.threats.join(', ')}`,
        severity: 'high',
        source: 'url'
      });
    }

    if (!domainResult.ssl.isValid) {
      issues.push({
        type: 'INVALID_SSL',
        description: 'SSL 인증서가 유효하지 않거나 만료됨',
        severity: 'medium',
        source: 'url'
      });
    }

    if (domainResult.dnsbl.isListed) {
      issues.push({
        type: 'DNS_BLACKLIST',
        description: `DNS 블랙리스트 등록됨: ${domainResult.dnsbl.listedOn.join(', ')}`,
        severity: 'high',
        source: 'url'
      });
    }

    if (domainResult.surbl.isListed) {
      issues.push({
        type: 'SPAM_BLACKLIST',
        description: `스팸 도메인 블랙리스트 등록됨: ${domainResult.surbl.listedOn.join(', ')}`,
        severity: 'high',
        source: 'url'
      });
    }

    return issues;
  }

  async analyzeURL(url: string, jsCode: string, businessNumber?: string): Promise<DetailResult> {
    try {
      const issues: Issue[] = [];

      // 도메인 분석
      const domainAnalysis = await this.analyzeDomain(url);
      const domainIssues = this.processDomainAnalysis(domainAnalysis);
      issues.push(...domainIssues);

      // 회사 정보 분석
      const companyDetails: CompanyDetails = {
        businessStatus: null,
        statusCode: null,
        taxType: null,
        taxTypeCode: null,
        issues: []
      };

      if (businessNumber) {
        const companyAnalysis = await this.companyService.analyzeCompany(businessNumber);

        companyDetails.businessStatus = companyAnalysis.details.status;
        companyDetails.statusCode = companyAnalysis.details.statusCode;
        companyDetails.taxType = companyAnalysis.details.taxType;
        companyDetails.taxTypeCode = companyAnalysis.details.taxTypeCode;

        if (!companyAnalysis.details.isValid) {
          const issue = {
            type: 'INVALID_BUSINESS',
            description: '유효하지 않은 사업자 번호',
            severity: 'high' as const,
            source: 'company' as const
          };
          issues.push(issue);
          companyDetails.issues.push(issue.description);
        }

        if (companyAnalysis.details.isClosed) {
          const issue = {
            type: 'CLOSED_BUSINESS',
            description: '폐업된 사업자',
            severity: 'high' as const,
            source: 'company' as const
          };
          issues.push(issue);
          companyDetails.issues.push(issue.description);
        }
      }

      // JavaScript 분석
      const jsAnalysis = this.jsAnalysisService.analyzeScript(jsCode);
      jsAnalysis.issues.forEach(jsIssue => {
        issues.push({
          type: jsIssue.type,
          description: jsIssue.description,
          severity: jsIssue.severity,
          source: 'javascript'
        });
      });

      return {
        url,
        status: this.determineStatus(issues),
        issues,
        analysisDetails: {
          urlAnalysis: {
            threat: domainAnalysis.urlhaus.threatType,
            status: domainAnalysis.urlhaus.isMalicious ? 'malicious' : 'safe',
            issues: domainIssues.map(i => i.description)
          },
          companyInfo: {
            businessStatus: companyDetails.businessStatus,
            statusCode: companyDetails.statusCode,
            taxType: companyDetails.taxType,
            taxTypeCode: companyDetails.taxTypeCode,
            issues: companyDetails.issues
          },
          jsAnalysis: {
            issues: jsAnalysis.issues,
            detectedPatterns: jsAnalysis.patterns
          },
          uiAnalysis: {
            issues: []
          }
        },
        lastChecked: new Date().toISOString()
      };

    } catch (error) {
      console.error('Analysis failed:', error);
      throw new Error('분석 중 오류가 발생했습니다.');
    }
  }



}

export const analysisService = new DomainAnalysisService();
