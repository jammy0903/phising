// src/services/urlHausService.ts
import {
    URLHausResponse,
    URLHausError,
    ApiResponse
} from '@utils/api/types';

export class URLHausService {
    private readonly apiKey: string;
    private readonly baseUrl = 'https://urlhaus-api.abuse.ch/v1';

    constructor() {
        this.apiKey = process.env.URLHAUS_API_KEY || '';
    }

    async lookupUrl(url: string): Promise<ApiResponse<URLHausResponse>> {
        try {
            const response = await fetch(`${this.baseUrl}/url/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            // API 응답 형식에 맞게 변환
            if (data.query_status === 'ok') {
                return {
                    success: true,
                    data: {
                        query_status: data.query_status,
                        url_info: data.url_info,
                        id: data.id,
                        threat: data.url_info?.threat || undefined,
                        status: data.url_info?.url_status
                    }
                };
            } else {
                return {
                    success: false,
                    error: (data as URLHausError).error_message
                };
            }
        } catch (error) {
            console.error('URLHaus lookup failed:', error);
            return {
                success: false,
                error: 'URLHaus lookup failed'
            };
        }
    }

    async lookupBulk(urls: string[]): Promise<ApiResponse<URLHausResponse>[]> {
        try {
            const results = await Promise.all(
                urls.map(url => this.lookupUrl(url))
            );
            return results;
        } catch (error) {
            console.error('URLHaus bulk lookup failed:', error);
            return urls.map(() => ({
                success: false,
                error: 'URLHaus bulk lookup failed'
            }));
        }
    }
}

export const urlHausService = new URLHausService();