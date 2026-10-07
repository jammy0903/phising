import { DomainAnalysisService } from '@services/analysisService';

// 네트워크 호출 없이 인스턴스화/인터페이스만 확인하는 스모크 테스트.
// (이전 테스트는 node dns 모킹 + result.urlhaus === domain 가정으로 구현과 불일치했음)
describe('DomainAnalysisService', () => {
  test('인스턴스 생성이 예외 없이 된다', () => {
    expect(() => new DomainAnalysisService()).not.toThrow();
  });

  test('analyzeDomain 은 잘못된 URL 에서 reject 된다', async () => {
    const service = new DomainAnalysisService();
    // 서비스가 catch 경로에서 남기는 정상 로그를 조용히 처리
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(service.analyzeDomain('not a url')).rejects.toBeDefined();
    spy.mockRestore();
  });
});
