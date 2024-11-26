import {
  ApiResponse,
  NTSApiResponse,
  NTSBusinessValidationRequest,
  NTSBusinessStatusRequest
} from './types';

export const API_CONFIG = {
  NTS_BASE_URL: 'https://api.odcloud.kr/api/nts-businessman/v1',
  NTS_SERVICE_KEY: process.env.NTS_SERVICE_KEY || '',
  SAFE_BROWSING_ENDPOINT: 'https://safebrowsing.googleapis.com/v4/threatMatches:find',
  URLHAUSENDPOINT: 'https://urlhaus-api.abuse.ch/v1/url/'
} as const;


interface RequestConfig extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export async function makeRequest<T>(
    url: string,
    options: RequestConfig = {}
): Promise<ApiResponse<T>> {
  const {
    timeout = 5000,
    retries = 3,
    retryDelay = 1000,
    ...fetchOptions
  } = options;

  let attempt = 0;

  while (attempt < retries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };

    } catch (error) {
      attempt++;

      if (error instanceof Error) {
        if (error.name === 'AbortError' || attempt === retries) {
          return {
            success: false,
            error: error.name === 'AbortError'
                ? `Request timeout after ${timeout}ms`
                : `Request failed after ${retries} attempts: ${error.message}`
          };
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        continue;
      }

      return {
        success: false,
        error: 'Unknown error occurred'
      };
    }
  }

  return {
    success: false,
    error: `Failed after ${retries} attempts`
  };
}

// 기본 NTS 요청 함수
async function makeNTSRequest(
    endpoint: 'validate' | 'status',
    data: NTSBusinessValidationRequest | NTSBusinessStatusRequest
): Promise<ApiResponse<NTSApiResponse>> {
  const url = `${API_CONFIG.NTS_BASE_URL}/${endpoint}?serviceKey=${encodeURIComponent(API_CONFIG.NTS_SERVICE_KEY)}`;

  return makeRequest<NTSApiResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(data),
    timeout: 10000,
    retries: 3,
    retryDelay: 1000
  });
}

// Rate Limiting을 적용한 NTS 요청 함수
export async function makeNTSRequestWithRetry<T>(
    endpoint: 'validate' | 'status',
    body: NTSBusinessValidationRequest | NTSBusinessStatusRequest,
    config: {
      maxRetries?: number;
      retryDelay?: number;
      serviceKey: string;
    }
): Promise<ApiResponse<NTSApiResponse>> {
  const { maxRetries = 3, retryDelay = 1000, serviceKey } = config;
  const url = `${API_CONFIG.NTS_BASE_URL}/${endpoint}?serviceKey=${encodeURIComponent(serviceKey)}`;

  return makeRequest<NTSApiResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(body),
    timeout: 10000,
    retries: maxRetries,
    retryDelay: retryDelay
  });
}

// Rate Limiting을 적용한 NTS 요청 생성기
export const createRateLimitedNTSRequest = (requestsPerSecond: number = 3) => {
  let lastRequestTime = 0;
  const minDelay = 1000 / requestsPerSecond;

  return async (
      endpoint: 'validate' | 'status',
      data: NTSBusinessValidationRequest | NTSBusinessStatusRequest
  ): Promise<ApiResponse<NTSApiResponse>> => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < minDelay) {
      await new Promise(resolve => setTimeout(resolve, minDelay - timeSinceLastRequest));
    }

    lastRequestTime = Date.now();
    return makeNTSRequest(endpoint, data);
  };
};