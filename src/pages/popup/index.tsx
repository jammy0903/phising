// src/pages/popup/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import Popup from './popup';
import '../../styles/global.css';

// Chrome extension context setup
if (chrome?.tabs === undefined) {
    throw new Error('This script should only run in a Chrome extension context');
}

// Initialize root container
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

// Create and render root
const root = createRoot(container);
root.render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>
);