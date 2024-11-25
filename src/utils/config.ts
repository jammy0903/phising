export const API_CONFIG = {
    NTS_BASE_URL: process.env.NTS_BASE_URL || 'https://api.odcloud.kr/api/nts-businessman/v1',
    NTS_SERVICE_KEY: process.env.NTS_SERVICE_KEY || ''
} as const;
