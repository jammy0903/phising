import React from 'react';
import { createRoot } from 'react-dom/client';
//import analysis from './analysis';
import '../../styles/global.css';


const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}
const root = createRoot(container);