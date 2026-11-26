import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../dist/frontend/index.css';
import './preview.css';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Standalone Settings preview root was not found.');
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
