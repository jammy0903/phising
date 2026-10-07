//src/services/jsAnalysisService.ts

import {
    JSAnalysisResult,
    JSIssue,
    DetectedPattern,
    PatternType,
    Severity,
    APIMonitorConfig,
    Issue
} from '@utils/api/types';

export class JSAnalysisService {
    private issues: JSIssue[] = [];
    private isAnalyzing: boolean = false;
    private analysisInterval: NodeJS.Timeout | null = null;
    private callback: ((issues: JSIssue[]) => void) | null = null;

    private readonly patterns: Record<PatternType, RegExp[]> = {
        // 고신호(高信號) 패턴만 남긴다. 정상 사이트에도 흔한 API는
        // 단독으로는 점수를 거의 주지 않도록 categoryWeights 에서 조정한다.
        browserExploit: [
            /\.constructor\s*\(\s*['"]/g,          // Function constructor 로 코드 생성
            /\.constructor\.constructor/g,
            /__proto__\s*\[/g,
            /\[\s*['"]constructor['"]\s*\]/g
        ],
        dataExfiltration: [
            // 저장소/쿠키를 그대로 전송 = 고신호
            /\.send\s*\(\s*[^)]*(localStorage|sessionStorage|document\.cookie)/g,
            /(fetch|axios)\s*\([^)]*\b(document\.cookie|localStorage|sessionStorage)\b/g,
            /navigator\.sendBeacon\s*\([^)]*(cookie|localStorage|sessionStorage|password|passwd|pwd)/gi,
            /new\s+WebSocket\s*\(\s*['"`]wss?:\/\//g
            // 일반 cross-origin fetch 탐지는 regex 대신 background 의
            // webRequest 네트워크 모니터링이 담당한다(오탐 방지).
        ],
        xss: [
            /document\.write\s*\(/g,
            /\.insertAdjacentHTML/g,
            /execScript/g,
            /new\s+Function\s*\(\s*['"]/g,
            /setTimeout\(\s*['"]/g,
            /setInterval\(\s*['"]/g
        ],
        keylogger: [
            /addEventListener\(\s*['"](keydown|keyup|keypress)['"]/g,
            /document\.onkey(down|up|press)\s*=/g,
            /\.(keyCode|charCode)\b/g
        ],
        formHijacking: [
            /form(\.|\s*\[['"])action\s*\]?\s*=/g,       // 폼 action 을 코드로 바꿈
            /addEventListener\(\s*['"]submit['"]/g
        ],
        redirect: [
            /location\s*\.\s*(href|replace|assign)\s*=/g,
            /location\s*\.\s*replace\s*\(/g,
            /window\.open\s*\(/g
        ],
        obfuscation: [
            /\beval\s*\(/g,
            /String\.fromCharCode/g,
            /\batob\s*\(/g,
            /unescape\s*\(/g,
            /\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){4,}/gi    // 연속 hex 이스케이프 = 난독화 징후
        ],
        communication: [
            /\.postMessage\s*\(\s*[^,]*,\s*['"`]\*['"`]/g   // targetOrigin '*' = 위험
        ],
        security: [
            /SecurityPolicyViolation/g,
            /SecurityError/g
        ],
        worker: [
            /serviceWorker\.register/g,
            /new\s+SharedWorker/g
        ],
        api_usage: [
            /window\.crypto\.subtle/g
        ],
        // URL 휴리스틱은 코드 정규식이 아니라 urlHeuristics.ts 에서 판정한다.
        suspiciousUrl: []
    } as const;

    // 카테고리별 가중치(점수). 한 번이라도 매칭되면 이 점수가 가산된다.
    // 흔하지만 맥락상 의미 있는 것은 낮게, 피싱 특이 신호는 높게 둔다.
    private readonly categoryWeights: Record<PatternType, number> = {
        browserExploit: 35,
        dataExfiltration: 30,
        xss: 15,
        keylogger: 15,
        formHijacking: 20,
        redirect: 8,
        obfuscation: 25,
        communication: 15,
        security: 10,
        worker: 5,
        api_usage: 3,
        suspiciousUrl: 0   // URL 점수는 urlHeuristics.ts 에서 별도 산정
    } as const;

    // 점수 → 상태 임계치
    private static readonly RISK_THRESHOLD_DANGER = 60;
    private static readonly RISK_THRESHOLD_WARNING = 30;

    // 누적 리스크 점수(analyze 1회 기준)
    private riskScore = 0;

    private readonly patternDescriptions: Record<PatternType, string> = {
        browserExploit: '브라우저 취약점을 악용하는 코드가 발견되었습니다.',
        dataExfiltration: '데이터 유출 시도가 감지되었습니다.',
        xss: 'XSS 공격 시도가 감지되었습니다.',
        keylogger: '키보드 입력을 감시하는 코드가 발견되었습니다.',
        formHijacking: '폼 데이터를 가로채는 코드가 발견되었습니다.',
        redirect: '페이지 리다이렉션 코드가 발견되었습니다.',
        obfuscation: '의심스러운 코드 난독화가 발견되었습니다.',
        communication: '창 간 통신 시도가 감지되었습니다.',
        security: '보안 정책 위반이 감지되었습니다.',
        worker: '웹 워커 사용이 감지되었습니다.',
        api_usage: '민감한 API 사용이 감지되었습니다.',
        suspiciousUrl: '의심스러운 URL 패턴이 감지되었습니다.'
    } as const;

    private readonly patternSeverities: Record<PatternType, Severity> = {
        browserExploit: 'high',
        dataExfiltration: 'high',
        xss: 'high',
        keylogger: 'high',
        formHijacking: 'high',
        redirect: 'medium',
        obfuscation: 'medium',
        communication: 'medium',
        security: 'high',
        worker: 'medium',
        api_usage: 'medium',
        suspiciousUrl: 'medium'
    } as const;

    private analyzeIframes(): void {
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                if (iframe.src) {
                    const iframeSrc = new URL(iframe.src);
                    if (iframeSrc.hostname !== window.location.hostname) {
                        // 외부 iframe 은 광고/임베드로 매우 흔하므로 약한 신호(low)로만 기록
                        this.issues.push({
                            type: 'redirect',
                            severity: 'low',
                            description: '외부 도메인의 iframe 감지됨',
                            location: `iframe: ${iframeSrc.hostname}`
                        });
                        this.riskScore += 3;
                    }
                }
            } catch (error) {
                console.error('iframe analysis failed:', error);
            }
        });
    }
    private monitorSensitiveAPIs(): void {
        const sensitiveAPIs: APIMonitorConfig[] = [
            {obj: window, props: ['fetch', 'XMLHttpRequest', 'WebSocket']},
            {obj: document, props: ['cookie']},
            {obj: window.localStorage, props: ['setItem', 'getItem']},
            {obj: window.sessionStorage, props: ['setItem', 'getItem']},
            {obj: navigator, props: ['sendBeacon', 'geolocation']}
        ];

        sensitiveAPIs.forEach(({obj, props}) => {
            props.forEach(prop => {
                if (!obj || !(prop in obj)) return;

                const original = obj[prop];
                if (typeof original === 'function' || (typeof original === 'object' && original !== null)) {
                    obj[prop] = new Proxy(original, {
                        apply: (target: Function, thisArg: any, args: any[]) => {
                            this.reportSensitiveAPIUsage(prop, args);
                            return Reflect.apply(target, thisArg, args);
                        }
                    });
                }
            });
        });
    }
    private monitorWorkers(): void {
        const originalWorker = window.Worker;
        window.Worker = new Proxy(originalWorker, {
            construct: (target, args) => {
                this.issues.push({
                    type: 'worker',
                    severity: 'medium',
                    description: '웹 워커 생성 시도 감지',
                    location: `Worker Script: ${args[0]}`
                });
                return Reflect.construct(target, args);
            }
        });

        if (navigator.serviceWorker) {
            const original = navigator.serviceWorker.register;
            navigator.serviceWorker.register = new Proxy(original, {
                apply: (target, thisArg, args) => {
                    this.issues.push({
                        type: 'worker',
                        severity: 'high',
                        description: '서비스 워커 등록 시도 감지',
                        location: `Service Worker: ${args[0]}`
                    });
                    return Reflect.apply(target, thisArg, args);
                }
            });
        }
    } // 클릭제킹
    private analyzeDOMElements(): void {
        document.querySelectorAll('*').forEach(element => {
            const style = window.getComputedStyle(element);
            if (this.isHiddenOverlay(style)) {
                this.issues.push({
                    type: 'formHijacking',
                    severity: 'high',
                    description: '숨겨진 오버레이 요소 발견(클릭재킹 의심)',
                    location: `Element: ${element.tagName}`
                });
                this.riskScore += 30;
            }

            if (element instanceof HTMLInputElement) {
                this.checkHiddenInput(element, style);
            }
        });
    }

    private isHiddenOverlay(style: CSSStyleDeclaration): boolean {
        return style.position === 'fixed' &&
            style.zIndex === '9999' &&
            (style.opacity === '0' || style.visibility === 'hidden');
    }
// 시각적으로 숨겨진 '자격증명' 입력 필드만 위험으로 본다.
// type="hidden" 은 CSRF 토큰 등 정상 사이트도 광범위하게 쓰므로 제외한다.
    private checkHiddenInput(input: HTMLInputElement, style: CSSStyleDeclaration): void {
        const sensitiveTypes = ['password', 'text', 'email', 'tel'];
        if (input.type === 'hidden') return;              // 정상 패턴 — 무시

        const visuallyHidden =
            style.opacity === '0' ||
            style.visibility === 'hidden' ||
            style.display === 'none';

        // 비밀번호/아이디 류 입력이 눈에 안 보이게 숨겨져 있으면 자격증명 탈취 의심
        if (sensitiveTypes.includes(input.type) && visuallyHidden) {
            this.issues.push({
                type: 'formHijacking',
                severity: 'high',
                description: '보이지 않게 숨겨진 자격증명 입력 필드 발견',
                location: `Input[type=${input.type}]: ${input.name || input.id || 'unnamed'}`
            });
            this.riskScore += 25;
        }
    }

    private analyzeEventListeners(): void {
        // 인라인 키 이벤트 핸들러만 본다(onclick/onsubmit 은 너무 흔해 제외).
        // 키 이벤트 핸들러는 그 자체로는 약한 신호라 low 로 둔다.
        const keyEventAttrs = ['onkeyup', 'onkeydown', 'onkeypress'];
        let keyHandlerCount = 0;
        document.querySelectorAll('*').forEach(element => {
            keyEventAttrs.forEach(attr => {
                if (element.hasAttribute(attr)) keyHandlerCount++;
            });
        });
        if (keyHandlerCount > 0) {
            this.issues.push({
                type: 'keylogger',
                severity: keyHandlerCount >= 3 ? 'medium' : 'low',
                description: `인라인 키 입력 핸들러 ${keyHandlerCount}개 발견`,
                location: 'inline on-key handlers'
            });
            this.riskScore += Math.min(keyHandlerCount * 5, 15);
        }
    }

    private analyzeExecutionContext(): void {
        // 교차 출처 iframe 자체는 광고/임베드 등으로 매우 흔하므로 신호로 쓰지 않는다.
        // (frame.postMessage 존재 여부는 모든 프레임이 참이라 의미 없어 제거)
        // iframe 분석은 analyzeIframes() 에서 처리한다.
    }
//IP위치 어딘가
    private getLocationInfo(matches: RegExpMatchArray[], code: string): string {
        return matches
            .map(match => {
                if (match.index === undefined) return '';
                const lineNumber = code.substring(0, match.index).split('\n').length;
                return `Line ${lineNumber}`;
            })
            .filter(Boolean)
            .join(', ');
    }


//API보내나 안보내나
    private reportSensitiveAPIUsage(api: string, args: any[]): void {
        const stack = new Error().stack;
        this.issues.push({
            type: 'api_usage',
            severity: 'medium',
            description: `민감한 API 사용 감지: ${api}`,
            location: stack ? stack.split('\n')[2] : 'unknown'
        });
    }
    // 기여 점수 → 개별 이슈 심각도
    private severityFromContribution(contribution: number): Severity {
        if (contribution >= 25) return 'high';
        if (contribution >= 12) return 'medium';
        return 'low';
    }

    // 누적 점수 → 페이지 전체 상태
    public getStatus(): 'safe' | 'warning' | 'danger' {
        if (this.riskScore >= JSAnalysisService.RISK_THRESHOLD_DANGER) return 'danger';
        if (this.riskScore >= JSAnalysisService.RISK_THRESHOLD_WARNING) return 'warning';
        return 'safe';
    }

    public getRiskScore(): number {
        return this.riskScore;
    }

    public analyzeScript(code: string): JSAnalysisResult {
        try {
            if (!code) {
                return { issues: [], patterns: [] };
            }

            const scriptIssues: JSIssue[] = [];
            const detectedPatterns: DetectedPattern[] = [];

            Object.entries(this.patterns).forEach(([type, patterns]) => {
                const patternType = type as PatternType;
                const matches = this.detectPatterns(code, patterns);

                if (matches.length > 0) {
                    // 기여 점수 = 가중치 × (1 + 반복 보너스). 매칭이 많을수록 조금 더.
                    const weight = this.categoryWeights[patternType];
                    const repeatBonus = 1 + 0.1 * Math.min(matches.length - 1, 5);
                    const contribution = Math.round(weight * repeatBonus);

                    this.riskScore += contribution;

                    scriptIssues.push({
                        type: patternType,
                        severity: this.severityFromContribution(contribution),
                        description: this.patternDescriptions[patternType],
                        location: this.getLocationInfo(matches, code)
                    });

                    detectedPatterns.push({
                        pattern: patterns.map(p => p.source).join('|'),
                        count: matches.length,
                        risk: contribution
                    });
                }
            });

            return {
                issues: scriptIssues,
                patterns: detectedPatterns
            };

        } catch (error) {
            return {
                issues: [{
                    type: 'obfuscation',
                    severity: 'high',
                    description: `분석 중 오류 발생: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                patterns: []
            };
        }
    }

    private detectPatterns(code: string, patterns: RegExp[]): RegExpMatchArray[] {
        try {
            return patterns.flatMap(pattern => {
                // 입력값 유효성 검사 추가
                if (!pattern || !(pattern instanceof RegExp)) {
                    console.warn('Invalid pattern:', pattern);
                    return [];
                }

                // pattern이 null이나 undefined가 아닌지 한번 더 확인
                const globalPattern = pattern?.global ? pattern : new RegExp(pattern.source, 'g');

                // code가 string인지 확인
                if (typeof code !== 'string') {
                    console.warn('Invalid code type:', typeof code);
                    return [];
                }

                try {
                    return Array.from(code.matchAll(globalPattern));
                } catch (matchError) {
                    console.error('Pattern matching error:', {
                        pattern: globalPattern,
                        error: matchError
                    });
                    return [];
                }
            });
        } catch (error) {
            console.error('Pattern detection error:', error);
            return [];
        }
    }


    public startAnalysis(callback: (issues: JSIssue[]) => void): void {
        if (this.isAnalyzing) return;

        this.callback = callback;
        this.isAnalyzing = true;

        // 초기 분석 실행
        this.runAnalysis();

        // 주기적 분석 설정 (5초마다)
        this.analysisInterval = setInterval(() => {
            this.runAnalysis();
        }, 5000);
    }

    public stopAnalysis(): void {
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        this.isAnalyzing = false;
        this.callback = null;
        this.issues = [];
    }

    private runAnalysis(): void {
        try {
            const result = this.analyze();
            if (result.issues.length > 0 && this.callback) {
                this.callback(result.issues);
            }
        } catch (error) {
            console.error('Analysis failed:', error);
        }
    }

    public analyze(): JSAnalysisResult {
        // ⚠️ 매 분석마다 상태 초기화. 초기화하지 않으면 5초 주기/DOM 변경마다
        // issues 와 riskScore 가 무한 누적되어 모든 페이지가 '위험'이 된다.
        this.issues = [];
        this.riskScore = 0;

        const analysisResult: JSAnalysisResult = {
            issues: [],
            patterns: []
        };

        try {
            this.analyzeDOMElements();
            this.analyzeEventListeners();
            this.analyzeExecutionContext();
            this.analyzeIframes();
            // monitorWorkers()/monitorSensitiveAPIs() 는 content script 의
            // isolated world 에서는 페이지 실제 객체에 영향을 주지 못하고,
            // 호출마다 Proxy 가 중첩되므로 analyze 루프에서 제외한다.

            // 페이지의 모든 스크립트 분석
            document.querySelectorAll('script').forEach(script => {
                if (script.textContent) {
                    const scriptAnalysis = this.analyzeScript(script.textContent);
                    analysisResult.issues.push(...scriptAnalysis.issues);
                    analysisResult.patterns.push(...scriptAnalysis.patterns);
                }
            });

            return {
                issues: this.dedupeIssues([...analysisResult.issues, ...this.issues]),
                patterns: analysisResult.patterns
            };
        } catch (error) {
            console.error('Analysis error:', error);
            return {
                issues: [{
                    type: 'xss',
                    severity: 'high',
                    description: `분석 중 오류 발생: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                patterns: []
            };
        }
    }

    // 객체 참조 기준이 아니라 내용(type+description+location) 기준으로 중복 제거
    private dedupeIssues(issues: JSIssue[]): JSIssue[] {
        const seen = new Set<string>();
        return issues.filter(issue => {
            const key = `${issue.type}|${issue.description}|${issue.location ?? ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
}

export const jsAnalysisService = new JSAnalysisService();