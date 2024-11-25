import { DomainAnalysisService } from '@services/analysisService';
import dns from 'dns';

// DNS 모듈 모킹
jest.mock('dns', () => ({
    lookup: jest.fn(),
    promises: {
        lookup: jest.fn()
    }
}));

describe('DomainAnalysisService', () => {
    let service: DomainAnalysisService;

    beforeEach(() => {
        // 각 테스트 전에 서비스 인스턴스 생성
        service = new DomainAnalysisService();

        // DNS lookup 모킹 설정
        (dns.promises.lookup as jest.Mock).mockResolvedValue({ address: '1.2.3.4', family: 4 });

        // 다른 의존성들도 필요한 경우 여기서 모킹
    });

    afterEach(() => {
        // 각 테스트 후 모든 모킹 초기화
        jest.clearAllMocks();
    });

    test('analyzeDomain: 전체 분석이 올바르게 작동하는 경우', async () => {
        // 테스트할 도메인
        const testDomain = 'malicious.test.url';

        // 필요한 다른 서비스들의 응답도 모킹
        // 예: URLhaus, Safe Browsing, SSL 체크 등

        try {
            const result = await service.analyzeDomain(testDomain);

            // 결과 검증
            expect(result).toBeDefined();
            expect(result.urlhaus).toBe(testDomain);
            // 다른 필요한 검증들 추가

        } catch (error) {
            fail('테스트가 실패하면 안됩니다: ' + error);
        }
    });

    // 실패 케이스에 대한 테스트도 추가
    test('analyzeDomain: DNS 조회 실패시 에러 처리', async () => {
        const testDomain = 'invalid.domain';

        // DNS 조회 실패 시뮬레이션
        (dns.promises.lookup as jest.Mock).mockRejectedValue(new Error('DNS lookup failed'));

        await expect(service.analyzeDomain(testDomain)).rejects.toThrow('Invalid domain');
    });

    jest.mock('../src/services/urlhausService', () => ({
        checkURLhaus: jest.fn().mockResolvedValue({ ismalicious: false })
    }));

    jest.mock('../src/services/safeBrowsingService', () => ({
        checkSafeBrowsing: jest.fn().mockResolvedValue({ isSafe: true })
    }));





});


// test/helpers/mockHelpers.ts
export const mockSuccessfulDNSLookup = () => {
    return (dns.promises.lookup as jest.Mock).mockResolvedValue({
        address: '1.2.3.4',
        family: 4
    });
};

export const mockFailedDNSLookup = () => {
    return (dns.promises.lookup as jest.Mock).mockRejectedValue(
        new Error('DNS lookup failed')
    );
};

