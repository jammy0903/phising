// src/utils/api.ts

import {
  ApiResponse,
  NTSApiResponse,
  NTSBusinessStatusRequest, NTSBusinessValidationRequest
} from './types';


export const API_CONFIG = {
  URLHAUS_ENDPOINT: 'https://urlhaus-api.abuse.ch/v1/url/',
  NTS_BASE_URL: 'https://api.odcloud.kr/api/nts-businessman/v1',
  SAFE_BROWSING_ENDPOINT: 'https://safebrowsing.googleapis.com/v4/threatMatches:find',
  DNSBL_SERVERS: [
    'zen.spamhaus.org',
    'bl.spamcop.net',
    'dnsbl.sorbs.net'
  ],
  SURBL_SERVERS: [  // SURBL 서버 목록 추가
    'multi.surbl.org',
    'multi.uribl.com'
  ],
  REQUEST_TIMEOUT: 10000,
  MAX_RETRIES: 3,
  NTS_SERVICE_KEY: process.env.NTS_SERVICE_KEY || ''
};

// 기본 API 요청 함수
export async function makeRequest<T>(
    url: string,
    options: RequestInit,
    retries = API_CONFIG.MAX_RETRIES
): Promise<ApiResponse<T>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.REQUEST_TIMEOUT);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        if (retries > 0) {
          console.log(`Request timeout, retrying... (${retries} attempts left)`);
          return makeRequest<T>(url, options, retries - 1);
        }
        return {
          success: false,
          error: 'Request timeout after multiple attempts'
        };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// NTS 관련 에러 클래스
class NTSRequestError extends Error {
  constructor(
      message: string,
      public endpoint: string,
      public statusCode?: number,
      public responseData?: any
  ) {
    super(message);
    this.name = 'NTSRequestError';
  }
}

// NTS API 요청 함수
export async function makeNTSRequest(
    endpoint: 'validate' | 'status',
    data: NTSBusinessValidationRequest | NTSBusinessStatusRequest,
    serviceKey: string = API_CONFIG.NTS_SERVICE_KEY
): Promise<ApiResponse<NTSApiResponse>> {
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const url = `${API_CONFIG.NTS_BASE_URL}/${endpoint}?serviceKey=${encodeURIComponent(serviceKey)}`;

    console.log(`[NTS-API][${requestId}] Request to ${endpoint}:`, {
      url: url.replace(serviceKey, '****'),
      data
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new NTSRequestError(
          `HTTP error! status: ${response.status}`,
          endpoint,
          response.status
      );
    }

    const responseData: NTSApiResponse = await response.json();

    if (!responseData || !Array.isArray(responseData.data)) {
      throw new NTSRequestError(
          'Invalid response format',
          endpoint,
          response.status,
          responseData
      );
    }

    console.log(`[NTS-API][${requestId}] Success response from ${endpoint}:`, {
      status_code: responseData.status_code,
      dataCount: responseData.data.length
    });

    return {
      success: true,
      data: responseData
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    console.error(`[NTS-API][${requestId}] Request failed for ${endpoint}:`, {
      error: errorMessage,
      details: error instanceof NTSRequestError ? {
        statusCode: error.statusCode,
        responseData: error.responseData
      } : undefined
    });

    return {
      success: false,
      error: errorMessage
    };
  }
}

// Rate Limiting 유틸리티
export const createRateLimitedNTSRequest = (requestsPerSecond: number = 3) => {
  let lastRequestTime = 0;
  const minDelay = 1000 / requestsPerSecond;

  return async (
      endpoint: 'validate' | 'status',
      data: NTSBusinessValidationRequest | NTSBusinessStatusRequest,
      serviceKey?: string
  ): Promise<ApiResponse<NTSApiResponse>> => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < minDelay) {
      await new Promise(resolve =>
          setTimeout(resolve, minDelay - timeSinceLastRequest)
      );
    }

    lastRequestTime = Date.now();
    return makeNTSRequest(endpoint, data, serviceKey);
  };
};

// 재시도 로직을 포함한 래퍼 함수
export const makeNTSRequestWithRetry = async (
    endpoint: 'validate' | 'status',
    data: NTSBusinessValidationRequest | NTSBusinessStatusRequest,
    options: {
      maxRetries?: number;
      retryDelay?: number;
      serviceKey?: string;
    } = {}
): Promise<ApiResponse<NTSApiResponse>> => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    serviceKey
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await makeNTSRequest(endpoint, data, serviceKey);
      if (response.success) {
        return response;
      }
      lastError = new Error(response.error);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
    }

    if (attempt < maxRetries) {
      await new Promise(resolve =>
          setTimeout(resolve, retryDelay * Math.pow(2, attempt))
      );
    }
  }

  return {
    success: false,
    error: `Failed after ${maxRetries} retries: ${lastError?.message}`
  };
};
