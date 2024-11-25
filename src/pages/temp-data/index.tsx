import React from 'react';
import { createRoot } from 'react-dom/client';
import TempData from './temp-data';
import '../../styles/global.css';

// 메시지 리스너 설정
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NEW_MESSAGE') {
    // 새로운 메시지 수신 시 처리
    console.log('New message received:', message.data);
    // DOM 업데이트는 React 컴포넌트 내에서 처리
    window.dispatchEvent(new CustomEvent('newMessage', { detail: message.data }));
  }
  return true;
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <TempData />
  </React.StrictMode>
);

// 페이지 언로드 시 cleanup
window.addEventListener('unload', () => {
  // 필요한 cleanup 작업 수행
});