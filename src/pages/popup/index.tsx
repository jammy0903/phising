import React from 'react';
import { createRoot } from 'react-dom/client';
import PopupUI from './popup';
import '../../styles/global.css';

// Error boundary를 위한 컴포넌트
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
    constructor(props: {children: React.ReactNode}) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 text-red-500">
                    Something went wrong. Please try again.
                </div>
            );
        }

        return this.props.children;
    }
}

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);

root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <PopupUI />
        </ErrorBoundary>
    </React.StrictMode>
);

// Chrome Extension API를 통한 스토리지 초기화
chrome.storage.local.get(['isLoggedIn', 'analysisResults'], (result) => {
    console.log('Loaded storage:', result);
});

// Cleanup
window.addEventListener('unload', () => {
    root.unmount();
});