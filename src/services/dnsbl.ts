// src/services/dnsbl.ts
//
// DNS 블랙리스트(DNSBL) / 도메인 블랙리스트(SURBL) 실제 조회.
//
// ⚠️ 이전 구현은 Math.random() 으로 위협을 '지어내던' 가짜였다.
// 여기서는 DNS-over-HTTPS(DoH) 로 실제 블랙리스트 존을 조회한다.
// 조회가 실패하거나 지원되지 않으면 "등록 안 됨"으로 간주한다(fail-open).
// 절대 임의로 위협을 만들어내지 않는다.

export interface BlacklistResult {
  isListed: boolean;
  listedOn: string[];
}

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

interface DohAnswer { name: string; type: number; data: string; }
interface DohResponse { Status: number; Answer?: DohAnswer[]; }

// DoH 로 A 레코드를 조회. 응답(127.0.0.x 등)이 있으면 그 data 배열을 반환.
async function resolveA(name: string, timeoutMs = 4000): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=A`, {
      headers: { Accept: 'application/dns-json' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json: DohResponse = await res.json();
    if (json.Status !== 0 || !json.Answer) return [];
    return json.Answer.filter(a => a.type === 1).map(a => a.data);
  } catch {
    return []; // 타임아웃/네트워크/차단 → 등록 안 됨으로 처리
  } finally {
    clearTimeout(timer);
  }
}

// 블랙리스트 존들
const DNSBL_ZONES = [
  { zone: 'zen.spamhaus.org', label: 'Spamhaus ZEN' },
  { zone: 'b.barracudacentral.org', label: 'Barracuda' },
];

const SURBL_ZONES = [
  { zone: 'multi.surbl.org', label: 'SURBL' },
  { zone: 'dbl.spamhaus.org', label: 'Spamhaus DBL' },
];

// 도메인 → IPv4. 첫 A 레코드만 사용.
async function resolveDomainIp(domain: string): Promise<string | null> {
  const ips = await resolveA(domain);
  return ips.length > 0 ? ips[0] : null;
}

// IP 기반 DNSBL 조회: IP 옥텟을 뒤집어 <d.c.b.a>.<zone> A 레코드를 조회.
export async function checkDnsbl(domain: string): Promise<BlacklistResult> {
  const ip = await resolveDomainIp(domain);
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return { isListed: false, listedOn: [] };
  }
  const reversed = ip.split('.').reverse().join('.');

  const checks = await Promise.all(
    DNSBL_ZONES.map(async ({ zone, label }) => {
      const answers = await resolveA(`${reversed}.${zone}`);
      // DNSBL 은 등재 시 127.0.0.x 를 반환한다.
      const listed = answers.some(a => a.startsWith('127.'));
      return listed ? label : null;
    })
  );

  const listedOn = checks.filter((x): x is string => x !== null);
  return { isListed: listedOn.length > 0, listedOn };
}

// 도메인 기반 SURBL 조회: <domain>.<zone> A 레코드를 조회.
export async function checkSurbl(domain: string): Promise<BlacklistResult> {
  const host = domain.replace(/^www\./, '');
  const checks = await Promise.all(
    SURBL_ZONES.map(async ({ zone, label }) => {
      const answers = await resolveA(`${host}.${zone}`);
      const listed = answers.some(a => a.startsWith('127.'));
      return listed ? label : null;
    })
  );

  const listedOn = checks.filter((x): x is string => x !== null);
  return { isListed: listedOn.length > 0, listedOn };
}
