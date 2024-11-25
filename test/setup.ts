// test/setup.ts

// test/setup.ts
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// 다른 전역 설정들도 필요하다면 여기에 추가
process.env.URLHAUS_API_KEY = 'df0c72a05463ec25a3668dddf3e477509edaf6d7fbc16d8f';
process.env.SAFE_BROWSING_API_KEY = 'AIzaSyCpNFVLm4GO-EYAD6G8zuDNTaP_Ft77S3o';