import { NodeMailgun } from 'ts-mailgun';
import {
    TempEmailData,
    TempPhoneData,
    EmailMessage,
    SMSMessage,
    TempDataServiceResponse,
    DurationType
} from '@utils/api/types';
export const DURATION_OPTIONS = {
    THIRTY_MINS: 30 * 60 * 1000,
    ONE_HOUR: 60 * 60 * 1000,
    ONE_DAY: 24 * 60 * 60 * 1000,
    SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000
} as const;
    export class TempDataService {
        private static readonly CONFIG = {
            MAX_RETRIES: 3,
            RETRY_DELAY: 1000,
            EMAIL_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 최대 7일
            CLEANUP_INTERVAL: 60 * 60 * 1000,
            DEFAULT_DOMAIN: 'sandbox.mailgun.org',
            DURATION_OPTIONS
        } as const;

        private static DB_NAME = 'TempDataDB';
        private static EMAIL_STORE = 'tempEmails';
        private static PHONE_STORE = 'tempPhones';

        private db: IDBDatabase | null = null;
        private readonly mailgunClient: NodeMailgun;
        private readonly mailgunKey: string;
        private cleanupInterval: NodeJS.Timeout | null = null;

        private readonly logger = {
            error: (msg: string, error?: any) => {
                console.error(`[TempDataService] ${msg}`, error);
                if (process.env.NODE_ENV !== 'production') {
                    console.error(error);
                }
            },
            info: (msg: string) => {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`[TempDataService] ${msg}`);
                }
            }
        };

        constructor() {
            if (!process.env.MAILGUN_API_KEY) {
                throw new Error('Missing required environment variable: MAILGUN_API_KEY');
            }

            this.mailgunKey = process.env.MAILGUN_API_KEY;
            const mailer = new NodeMailgun();
            mailer.apiKey = this.mailgunKey;
            mailer.domain = this.validateDomain(process.env.MAILGUN_DOMAIN || '')
                ? (process.env.MAILGUN_DOMAIN as string)
                : TempDataService.CONFIG.DEFAULT_DOMAIN;

            mailer.fromEmail = `noreply@${mailer.domain}`;
            mailer.fromTitle = 'Temporary Email Service';
            mailer.init();
            this.mailgunClient = mailer;

            this.initDB()
                .then(() => this.startCleanupInterval())
                .catch(this.logger.error);
        }

        private validateDomain(domain?: string): boolean {
            if (!domain) return false;
            const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
            return domainRegex.test(domain);
        }

        private startCleanupInterval(): void {
            this.cleanupInterval = setInterval(
                () => this.cleanupExpiredData().catch(this.logger.error),
                TempDataService.CONFIG.CLEANUP_INTERVAL
            );
        }

        private async initDB(): Promise<void> {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(TempDataService.DB_NAME, 1);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.db = request.result;
                    resolve();
                };

                request.onupgradeneeded = (event) => {
                    const db = (event.target as IDBOpenDBRequest).result;
                    if (!db.objectStoreNames.contains(TempDataService.EMAIL_STORE)) {
                        const emailStore = db.createObjectStore(TempDataService.EMAIL_STORE, { keyPath: 'email' });
                        emailStore.createIndex('expiresAt', 'expiresAt', { unique: false });
                    }
                    if (!db.objectStoreNames.contains(TempDataService.PHONE_STORE)) {
                        const phoneStore = db.createObjectStore(TempDataService.PHONE_STORE, { keyPath: 'phone' });
                        phoneStore.createIndex('expiresAt', 'expiresAt', { unique: false });
                    }
                };
            });
        }

        private async saveEmailData(data: TempEmailData): Promise<void> {
            if (!this.db) await this.initDB();

            return new Promise((resolve, reject) => {
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                const transaction = this.db.transaction([TempDataService.EMAIL_STORE], 'readwrite');
                const store = transaction.objectStore(TempDataService.EMAIL_STORE);
                const request = store.put(data);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        private async generateSecureRandomString(): Promise<string> {
            const array = new Uint8Array(12);
            crypto.getRandomValues(array);
            return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        }

        private async retryOperation<T>(
            operation: () => Promise<T>,
            maxRetries = TempDataService.CONFIG.MAX_RETRIES
        ): Promise<T> {
            let lastError;
            for (let i = 0; i < maxRetries; i++) {
                try {
                    return await operation();
                } catch (error) {
                    lastError = error;
                    this.logger.error(`Operation failed, attempt ${i + 1}/${maxRetries}:`, error);
                    await new Promise(resolve =>
                        setTimeout(resolve, TempDataService.CONFIG.RETRY_DELAY * Math.pow(2, i))
                    );
                }
            }
            throw lastError;
        }

        async generateTempEmail(duration: DurationType): Promise<TempDataServiceResponse<TempEmailData>> {
            try {
                const durationMs = DURATION_OPTIONS[duration];
                if (!durationMs || durationMs > TempDataService.CONFIG.EMAIL_EXPIRY) {
                    throw new Error('Invalid duration');
                }

                    const randomString = await this.generateSecureRandomString();
                const tempEmail = `temp.${randomString}@${this.mailgunClient.domain}`;
                const now = new Date();

                const emailData: TempEmailData = {
                    email: tempEmail,
                    expiresAt: new Date(now.getTime() + duration),
                    messages: [],
                    status: 'active',
                    createdAt: now
                };

                await this.retryOperation(() => this.saveEmailData(emailData));
                await this.retryOperation(() =>
                    this.setupMailgunForwarding(tempEmail, DURATION_OPTIONS[duration])
                );

                return {
                    success: true,
                    data: emailData
                };
            } catch (error) {
                this.logger.error('Failed to generate temp email:', error);
                return {
                    success: false,
                    error: 'Failed to generate temporary email'
                };
            }
        }

        // 활성 임시 데이터 조회 메서드 추가
        async getActiveData(): Promise<{
            emails: TempEmailData[];
            phones: TempPhoneData[];
        }> {
            const now = new Date();
            const [emails, phones] = await Promise.all([
                this.getActiveItems<TempEmailData>(TempDataService.EMAIL_STORE, now),
                this.getActiveItems<TempPhoneData>(TempDataService.PHONE_STORE, now)
            ]);

            return { emails, phones };
        }

        private async getActiveItems<T extends TempEmailData | TempPhoneData>(
            storeName: string,
            now: Date
        ): Promise<T[]> {
            if (!this.db) await this.initDB();

            return new Promise((resolve, reject) => {
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const index = store.index('expiresAt');
                const request = index.openCursor(IDBKeyRange.lowerBound(now));
                const items: T[] = [];

                request.onsuccess = () => {
                    const cursor = request.result;
                    if (cursor) {
                        items.push(cursor.value as T);  // 타입 캐스팅 추가
                        cursor.continue();
                    } else {
                        resolve(items);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        }

        private async setupMailgunForwarding(email: string, duration: number): Promise<void> {
            try {
                const route = {
                    priority: 1,
                    description: `Temporary email for ${email}`,
                    expression: `match_recipient("${email}")`,
                    action: ['store()'],
                    expires: new Date(Date.now() + duration).toISOString()
                };

                await this.mailgunClient.send(email, 'Temporary Email Activated',
                    'Your temporary email has been set up successfully.', route);

                this.logger.info(`Email setup completed for ${email}`);
            } catch (error) {
                this.logger.error('Failed to setup email:', error);
                throw error;
            }
        }

        async cleanupExpiredData(): Promise<void> {
            const now = new Date();
            await Promise.all([
                this.cleanupStore(TempDataService.EMAIL_STORE, now),
                this.cleanupStore(TempDataService.PHONE_STORE, now)
            ]);
        }

        private async cleanupStore(storeName: string, now: Date): Promise<void> {
            if (!this.db) await this.initDB();

            return new Promise((resolve, reject) => {
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const index = store.index('expiresAt');
                const request = index.openCursor(IDBKeyRange.upperBound(now));

                request.onsuccess = () => {
                    const cursor = request.result;
                    if (cursor) {
                        store.delete(cursor.primaryKey);
                        cursor.continue();
                    }
                };

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
        }

        async destroy(): Promise<void> {
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
            }
            if (this.db) {
                this.db.close();
                this.db = null;
            }
        }


        async generateTempPhone(duration: number): Promise<TempDataServiceResponse<TempPhoneData>> {
            try {
                const now = new Date();
                const phoneData: TempPhoneData = {
                    phone: this.generateRandomKoreanPhoneNumber(),
                    expiresAt: new Date(now.getTime() + duration),
                    messages: [],
                    status: 'active',
                    createdAt: now
                };

                await this.savePhoneData(phoneData);

                return {
                    success: true,
                    data: phoneData
                };
            } catch (error) {
                console.error('Failed to generate temp phone:', error);
                return {
                    success: false,
                    error: 'Failed to generate temporary phone number'
                };
            }
        }

        private generateRandomKoreanPhoneNumber(): string {
            const middleNumber = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
            const lastNumber = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
            return `010-${middleNumber}-${lastNumber}`;
        }

        private async savePhoneData(data: TempPhoneData): Promise<void> {
            if (!this.db) await this.initDB();

            return new Promise((resolve, reject) => {
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                const transaction = this.db.transaction([TempDataService.PHONE_STORE], 'readwrite');
                const store = transaction.objectStore(TempDataService.PHONE_STORE);
                const request = store.put(data);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        async getPhoneMessages(phone: string): Promise<SMSMessage[]> {
            if (!this.db) await this.initDB();

            return new Promise((resolve, reject) => {
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                const transaction = this.db.transaction([TempDataService.PHONE_STORE], 'readonly');
                const store = transaction.objectStore(TempDataService.PHONE_STORE);
                const request = store.get(phone);

                request.onsuccess = () => {
                    const data = request.result as TempPhoneData;
                    resolve(data?.messages || []);
                };
                request.onerror = () => reject(request.error);
            });
        }
    }


    export const tempDataService = new TempDataService();