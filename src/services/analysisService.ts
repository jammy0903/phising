import {API_CONFIG, makeRequest} from '@utils/api/api';
import * as dns from 'dns';
import {promisify} from 'util';
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

    if (!this.apiKey) {
      console.warn('URLHAUS_API_KEY is not set');
    }
    if (!this.safeBrowsingKey) {
      console.warn('SAFE_BROWSING_API_KEY is not set');
    }
  }

  private determineStatus(issues: Issue[]): 'safe' | 'warning' | 'danger' {
    if (issues.some(issue => issue.severity === 'high')) return 'danger';
    if (issues.some(issue => issue.severity === 'medium')) return 'warning';
    return 'safe';
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



  private async checkURLhaus(url: string): Promise<ApiResponse<URLHausResponse>> {
    try {
      return await makeRequest<URLHausResponse>(API_CONFIG.URLHAUS_ENDPOINT, {
        method: 'POST',
        headers: {
          'API-Key': this.apiKey,
        },
        body: JSON.stringify({url})
      });
    } catch (error) {
      console.error('URLhaus check failed:', error);
      return { success: false, error: 'URLhaus check failed' };
    }
  }

  private async checkSafeBrowsing(url: string): Promise<ApiResponse<SafeBrowsingResponse>> {
    try {
      const requestBody = {
        client: {
          clientId: "phishing-detector-extension",
          clientVersion: "1.0.0"
        },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION"
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }]
        }
      };

      return await makeRequest<SafeBrowsingResponse>(
          `${API_CONFIG.SAFE_BROWSING_ENDPOINT}?key=${this.safeBrowsingKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
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
      if (!response.ok) {
        throw new Error('Certificate lookup failed');
      }

      const certData = await response.json();
      if (certData.length > 0) {
        const latestCert = certData[0];
        const now = new Date();
        const validTo = new Date(latestCert.not_after);

        return {
          issuer: latestCert.issuer_name,
          validFrom: latestCert.not_before,
          validTo: latestCert.not_after,
          isValid: validTo > now
        };
      }
      throw new Error('No certificate found');
    } catch (error) {
      console.error('SSL check failed:', error);
      return {
        issuer: 'Unknown',
        validFrom: '',
        validTo: '',
        isValid: false
      };
    }
  }

  private async checkDNSBL(ip: string): Promise<string[]> {
    const listedOn: string[] = [];
    const lookup = promisify(dns.lookup);

    const checks = API_CONFIG.DNSBL_SERVERS.map(async (server: string) => {
      try {
        const lookupDomain = `${ip.split('.').reverse().join('.')}.${server}`;
        await lookup(lookupDomain);
        return server;
      } catch {
        return null;
      }
    });

    const results = await Promise.allSettled(checks);
    results.forEach((result: PromiseSettledResult<string | null>) => {
      if (result.status === 'fulfilled' && result.value) {
        listedOn.push(result.value);
      }
    });

    return listedOn;
  }

  private async checkSURBL(domain: string): Promise<string[]> {
    const listedOn: string[] = [];
    const lookup = promisify(dns.lookup);

    const checks = API_CONFIG.SURBL_SERVERS.map(async (server: string) => {
      try {
        const lookupDomain = `${domain}.${server}`;
        await lookup(lookupDomain);
        return server;
      } catch {
        return null;
      }
    });

    const results = await Promise.allSettled(checks);
    results.forEach((result: PromiseSettledResult<string | null>) => {
      if (result.status === 'fulfilled' && result.value) {
        listedOn.push(result.value);
      }
    });

    return listedOn;
  }

  public async analyzeDomain(url: string): Promise<DomainAnalysisResult> {
    try {
      const domain = new URL(url).hostname;
      let ip;
      try {
        ip = await promisify(dns.lookup)(domain);
      } catch (error) {
        console.error('DNS lookup failed:', error);
        throw new Error('Invalid domain');
      }

      const [urlhausResult, safeBrowsingResult, sslResult, dnsblResult, surblResult] =
          await Promise.allSettled([
            await this.checkURLhaus(url),
            await this.checkSafeBrowsing(url),
            await this.checkSSLCertificate(domain),
            await this.checkDNSBL(ip.address),
            await this.checkSURBL(domain),
          ] as const);


      return {
        urlhaus: {
          isMalicious: urlhausResult.status === 'fulfilled' &&
              urlhausResult.value.success &&
              urlhausResult.value.data?.query_status === 'listed',
          threatType: urlhausResult.status === 'fulfilled' &&
          urlhausResult.value.success ?
              urlhausResult.value.data?.threat : undefined
        },
        safeBrowsing: {
          isMalicious: safeBrowsingResult.status === 'fulfilled' &&
              safeBrowsingResult.value.success &&
              (safeBrowsingResult.value.data?.matches?.length ?? 0) > 0,
          threats: safeBrowsingResult.status === 'fulfilled' &&
          safeBrowsingResult.value.success ?
              (safeBrowsingResult.value.data?.matches?.map(m => m.threatType) ?? []) : []
        },
        ssl: sslResult.status === 'fulfilled' ? sslResult.value : {
          issuer: 'Unknown',
          validFrom: '',
          validTo: '',
          isValid: false
        },
        dnsbl: {
          isListed: dnsblResult.status === 'fulfilled' && dnsblResult.value.length > 0,
          listedOn: dnsblResult.status === 'fulfilled' ? dnsblResult.value : []
        },
        surbl: {
          isListed: surblResult.status === 'fulfilled' && surblResult.value.length > 0,
          listedOn: surblResult.status === 'fulfilled' ? surblResult.value : []
        }
      };
    } catch (error) {
      console.error('Domain analysis failed:', error);
      throw error;
    }
  }
}

export const analysisService = new DomainAnalysisService();
