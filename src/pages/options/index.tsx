import React from 'react';
import { createRoot } from 'react-dom/client';
import Options from './Options';
import '../../styles/global.css';

// 엄격 모드 활성화
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);

// Chrome Extension API를 통한 스토리지 초기화
chrome.storage.local.get(['isLoggedIn', 'subscriptionInfo'], (result) => {
  // 필요한 초기 데이터 로드
  console.log('Loaded storage:', result);
});

// 필요한 경우 cleanup 함수
window.addEventListener('unload', () => {
  // cleanup 로직
});