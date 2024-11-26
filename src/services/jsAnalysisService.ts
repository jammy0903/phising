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
        browserExploit: [
            /\.prototype\.(constructor|__proto__|__defineGetter__|__defineSetter__)/g,
            /Object\.defineProperty/g,
            /\.constructor\.constructor/g,
            /\[\s*['"]constructor['"]\s*\]/g,
            /with\s*\(/g,
            /debugger/g
        ],
        dataExfiltration: [
            /\.send\(.*localStorage/g,
            /\.send\(.*sessionStorage/g,
            /navigator\.sendBeacon/g,
            /fetch\(['"](https?:)?\/\/(?!${window.location.hostname})/g,
            /new\s+WebSocket\(/g,
            /\.upload\(/g,
            /\.ajax\(/g,
            /\.post\(/g
        ],
        xss: [
            /document\.write/g,
            /\.innerHTML\s*=/g,
            /\.outerHTML\s*=/g,
            /\.insertAdjacentHTML/g,
            /\$\(['"]*.*['"]*\)\.html\(/g,
            /execScript/g,
            /setInterval\(['"]/g,
            /setTimeout\(['"]/g,
            /new\s+Function\(['"]/g
        ],
        keylogger: [
            /addEventListener\(['"](keydown|keyup|keypress)['"]/g,
            /document\.onkeydown/g,
            /document\.onkeyup/g,
            /document\.onkeypress/g,
            /\.keyCode/g,
            /\.key\s*===/g,
            /\.charCode/g
        ],
        formHijacking: [
            /addEventListener\(['"](submit)['"]/g,
            /\.submit\(\)/g,
            /form\.elements/g,
            /\.preventDefault\(\)/g,
            /form\.action\s*=/g,
            /new\s+FormData/g,
            /querySelector\(['"](input|form|select|textarea)/g
        ],
        redirect: [
            /window\.location/g,
            /document\.location/g,
            /location\.href/g,
            /location\.replace/g,
            /history\.pushState/g,
            /history\.replaceState/g,
            /window\.navigate/g
        ],
        obfuscation: [
            /eval\(/g,
            /Function\(/g,
            /fromCharCode/g,
            /atob\(/g,
            /btoa\(/g,
            /unescape\(/g,
            /decodeURIComponent\(/g,
            /String\.fromCharCode/g
        ],
        communication: [
            /postMessage/g,
            /MessageChannel/g,
            /BroadcastChannel/g
        ],
        security: [
            /SecurityPolicyViolation/g,
            /SecurityError/g
        ],
        worker: [
            /new\s+Worker/g,
            /serviceWorker\.register/g,
            /SharedWorker/g
        ],
        api_usage: [
            /navigator\./g,
            /window\.crypto/g,
            /localStorage\./g,
            /sessionStorage\./g
        ]
    } as const;

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
        api_usage: '민감한 API 사용이 감지되었습니다.'
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
        api_usage: 'medium'
    } as const;

    private analyzeIframes(): void {
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                if (iframe.src) {
                    const iframeSrc = new URL(iframe.src);
                    if (iframeSrc.hostname !== window.location.hostname) {
                        this.issues.push({
                            type: 'redirect',
                            severity: 'medium',
                            description: '외부 도메인의 iframe 감지됨',
                            location: `iframe: ${iframeSrc.hostname}`
                        });
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
    }
    private analyzeDOMElements(): void {
        document.querySelectorAll('*').forEach(element => {
            const style = window.getComputedStyle(element);
            if (this.isHiddenOverlay(style)) {
                this.issues.push({
                    type: 'formHijacking',
                    severity: 'high',
                    description: '숨겨진 오버레이 요소 발견',
                    location: `Element: ${element.tagName}`
                });
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

    private checkHiddenInput(input: HTMLInputElement, style: CSSStyleDeclaration): void {
        if (input.type === 'hidden' || style.opacity === '0' || style.visibility === 'hidden') {
            this.issues.push({
                type: 'formHijacking',
                severity: 'high',
                description: '숨겨진 입력 필드 발견',
                location: `Input: ${input.name || input.id || 'unnamed'}`
            });
        }
    }

    private analyzeEventListeners(): void {
        document.querySelectorAll('*').forEach(element => {
            const eventAttributes = ['onclick', 'onsubmit', 'onkeyup', 'onkeydown', 'onkeypress'];
            eventAttributes.forEach(attr => {
                if (element.hasAttribute(attr)) {
                    this.issues.push({
                        type: 'formHijacking',
                        severity: 'medium',
                        description: `인라인 이벤트 핸들러 발견: ${attr}`,
                        location: `Element: ${element.tagName}`
                    });
                }
            });
        });
    }
    private analyzeExecutionContext(): void {
        try {
            Array.from(window.frames).forEach((frame: Window) => {
                try {
                    if (frame !== window && typeof frame.postMessage === 'function') {
                        this.issues.push({
                            type: 'dataExfiltration',
                            severity: 'medium',
                            description: '창 간 통신 시도 감지',
                            location: 'Window Communication'
                        });
                    }

                    if (frame.origin !== window.origin) {
                        this.issues.push({
                            type: 'browserExploit',
                            severity: 'high',
                            description: '다른 출처의 프레임 감지',
                            location: `Origin: ${frame.origin}`
                        });
                    }
                } catch (e) {
                    // 크로스 오리진 접근 제한으로 인한 오류 무시
                }
            });
        } catch (e) {
            console.warn('Frame analysis failed:', e);
        }
    }

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



    private reportSensitiveAPIUsage(api: string, args: any[]): void {
        const stack = new Error().stack;
        this.issues.push({
            type: 'api_usage',
            severity: 'medium',
            description: `민감한 API 사용 감지: ${api}`,
            location: stack ? stack.split('\n')[2] : 'unknown'
        });
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
                    scriptIssues.push({
                        type: patternType,
                        severity: this.patternSeverities[patternType],
                        description: this.patternDescriptions[patternType],
                        location: this.getLocationInfo(matches, code)
                    });

                    detectedPatterns.push({
                        pattern: patterns.map(p => p.source).join('|'),
                        count: matches.length,
                        risk: 0 // 점수 계산 제거
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
        const analysisResult: JSAnalysisResult = {
            issues: [],
            patterns: []
        };

        try {
            this.analyzeDOMElements();
            this.analyzeEventListeners();
            this.analyzeExecutionContext();
            this.monitorWorkers();
            this.monitorSensitiveAPIs();
            this.analyzeIframes();

            // 페이지의 모든 스크립트 분석
            document.querySelectorAll('script').forEach(script => {
                if (script.textContent) {
                    const scriptAnalysis = this.analyzeScript(script.textContent);
                    analysisResult.issues.push(...scriptAnalysis.issues);
                    analysisResult.patterns.push(...scriptAnalysis.patterns);
                }
            });

            // 인라인 이벤트 핸들러 분석
            this.analyzeInlineEventHandlers();

            return {
                issues: [...new Set([...analysisResult.issues, ...this.issues])],
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
    private analyzeInlineEventHandlers(): void {
        const elements = document.querySelectorAll('*');
        elements.forEach(element => {
            const attributes = element.attributes;
            for (let i = 0; i < attributes.length; i++) {
                const attr = attributes[i];
                if (attr.name.startsWith('on')) {
                    this.issues.push({
                        type: 'formHijacking',
                        severity: 'medium',
                        description: `인라인 이벤트 핸들러 발견: ${attr.name}`,
                        location: `Element: ${element.tagName}`
                    });
                }
            }
        });
    }
}

export const jsAnalysisService = new JSAnalysisService();