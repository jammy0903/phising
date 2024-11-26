//src/services/companyService.ts
import { makeNTSRequestWithRetry } from "@utils/api/api";
import { API_CONFIG } from "@utils/config";
import {
    ApiResponse,
    NTSApiResponse,
    ValidationResult,
    CompanyAnalysisResult
} from '@utils/api/types';

export class CompanyService {
    private static DB_NAME = 'CompanyValidationDB';
    private static STORE_NAME = 'validationResults';
    private static CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간

    private db: IDBDatabase | null = null;

    constructor() {
        this.initDB().catch(console.error);
    }

    private async initDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(CompanyService.DB_NAME, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(CompanyService.STORE_NAME)) {
                    const store = db.createObjectStore(CompanyService.STORE_NAME, { keyPath: 'b_no' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    private async cacheResult(result: ValidationResult): Promise<void> {
        if (!this.db) {
            await this.initDB();
        }

        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve();
                return;
            }

            const transaction = this.db.transaction([CompanyService.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CompanyService.STORE_NAME);
            const request = store.put({
                ...result,
                timestamp: Date.now()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    private async getCachedResult(businessNumber: string): Promise<ValidationResult | null> {
        if (!this.db) {
            await this.initDB();
        }

        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve(null);
                return;
            }

            const transaction = this.db.transaction([CompanyService.STORE_NAME], 'readonly');
            const store = transaction.objectStore(CompanyService.STORE_NAME);
            const request = store.get(businessNumber);

            request.onsuccess = () => {
                const result = request.result as ValidationResult;
                if (!result || Date.now() - result.timestamp > CompanyService.CACHE_DURATION) {
                    resolve(null);
                    return;
                }
                resolve(result);
            };

            request.onerror = () => reject(request.error);
        });
    }

    async validateBusiness(businessNumber: string): Promise<ApiResponse<NTSApiResponse>> {
        try {
            const cached = await this.getCachedResult(businessNumber);
            if (cached) {
                const validValue: 'Y' | 'N' = cached.isValid ? 'Y' : 'N';
                return {
                    success: true,
                    data: {
                        data: [{
                            b_no: cached.b_no,
                            valid: validValue,  // 'Y' | 'N' 타입으로 명시적 변환
                            b_stt: cached.details.b_stt,
                            b_stt_cd: cached.details.b_stt_cd,
                            tax_type: cached.details.tax_type,
                            tax_type_cd: cached.details.tax_type_cd,
                            rbf_tax_type: cached.details.rbf_tax_type,
                            rbf_tax_type_cd: cached.details.rbf_tax_type_cd
                        }],
                        status_code: "OK",
                        request_cnt: 1,
                        valid_cnt: cached.isValid ? 1 : 0
                    }
                };
            }

            return makeNTSRequestWithRetry('validate', {
                b_no: [businessNumber]
            }, {
                maxRetries: 3,
                retryDelay: 1000,
                serviceKey: API_CONFIG.NTS_SERVICE_KEY
            });
        } catch (error) {
            console.error('Business validation failed:', error);
            return {
                success: false,
                error: '사업자 번호 검증 실패'
            };
        }
    }

    async checkBusinessStatus(businessNumber: string): Promise<ApiResponse<NTSApiResponse>> {
        try {
            const cached = await this.getCachedResult(businessNumber);
            if (cached) {
                const validValue: 'Y' | 'N' = cached.isValid ? 'Y' : 'N';
                return {
                    success: true,
                    data: {
                        data: [{
                            b_no: cached.b_no,
                            valid: validValue,  // 'Y' | 'N' 타입으로 명시적 변환
                            b_stt: cached.details.b_stt,
                            b_stt_cd: cached.details.b_stt_cd,
                            tax_type: cached.details.tax_type,
                            tax_type_cd: cached.details.tax_type_cd,
                            rbf_tax_type: cached.details.rbf_tax_type,
                            rbf_tax_type_cd: cached.details.rbf_tax_type_cd
                        }],
                        status_code: "OK",
                        request_cnt: 1,
                        valid_cnt: 1
                    }
                };
            }

            return makeNTSRequestWithRetry('status', {
                b_no: [businessNumber]
            }, {
                maxRetries: 3,
                retryDelay: 1000,
                serviceKey: API_CONFIG.NTS_SERVICE_KEY
            });
        } catch (error) {
            console.error('Business status check failed:', error);
            return {
                success: false,
                error: '사업자 상태 조회 실패'
            };
        }
    }

    async analyzeCompany(businessNumber: string): Promise<CompanyAnalysisResult> {
        try {
            const [validationResponse, statusResponse] = await Promise.all([
                this.validateBusiness(businessNumber),
                this.checkBusinessStatus(businessNumber)
            ]);

            if (!validationResponse.success || !statusResponse.success ||
                !validationResponse.data?.data[0] || !statusResponse.data?.data[0]) {
                throw new Error('Invalid API response');
            }

            const validationData = validationResponse.data.data[0];
            const statusData = statusResponse.data.data[0];

            // 캐시에 결과 저장
            const validationResult: ValidationResult = {
                b_no: businessNumber,
                isValid: validationData.valid === 'Y',
                timestamp: Date.now(),
                details: {
                    valid: validationData.valid,
                    b_stt: statusData.b_stt,
                    b_stt_cd: statusData.b_stt_cd,
                    tax_type: statusData.tax_type,
                    tax_type_cd: statusData.tax_type_cd,
                    rbf_tax_type: statusData.rbf_tax_type,
                    rbf_tax_type_cd: statusData.rbf_tax_type_cd
                }
            };

            await this.cacheResult(validationResult);

            return {
                details: {
                    isValid: validationData.valid === 'Y',
                    status: statusData.b_stt,
                    statusCode: statusData.b_stt_cd,
                    taxType: statusData.tax_type,
                    taxTypeCode: statusData.tax_type_cd,
                    isClosed: statusData.b_stt_cd === '03'
                }
            };

        } catch (error) {
            console.error('Company analysis failed:', error);
            return {
                details: {
                    isValid: false,
                    status: '확인 불가',
                    statusCode: '',
                    taxType: '확인 불가',
                    taxTypeCode: '',
                    isClosed: false
                }
            };
        }
    }
}

export const companyService = new CompanyService();