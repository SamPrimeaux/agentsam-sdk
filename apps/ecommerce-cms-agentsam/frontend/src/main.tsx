import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminApp } from './app/AdminApp';
import { AdminProvider } from './app/AdminProvider';
import { createMockAdminHost } from './platform/adapters/MockAdminHost';
import { ToastProvider } from './design-system/Toast';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('AgentSam Ecommerce + CMS could not find #root');
}

const host = createMockAdminHost();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ToastProvider>
      <AdminProvider host={host} initialPath="/admin">
        <AdminApp />
      </AdminProvider>
    </ToastProvider>
  </React.StrictMode>,
);
