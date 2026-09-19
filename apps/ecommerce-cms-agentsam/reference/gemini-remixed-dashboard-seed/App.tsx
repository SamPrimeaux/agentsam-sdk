/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Application Root Entry Point
 */

import React, { useMemo } from 'react';
import { FuelNFreeTimeAdminHost } from './src/platform/adapters/FuelNFreeTimeAdminHost';
import { MockAdminHost } from './src/platform/adapters/MockAdminHost';
import { AdminProvider } from './src/app/AdminProvider';
import { AdminApp } from './src/app/AdminApp';
import { ToastProvider } from './src/design-system/Toast';

export const App: React.FC = () => {
  // In preview sandbox, instantiate MockAdminHost with Fuel & Free Time branding,
  // Completeful dry-run link states, write-only SecretStore, and D1 catalog bindings.
  const host = useMemo(() => {
    try {
      return MockAdminHost();
    } catch {
      return FuelNFreeTimeAdminHost({});
    }
  }, []);

  return (
    <ToastProvider>
      <AdminProvider host={host} initialPath="/admin">
        <AdminApp />
      </AdminProvider>
    </ToastProvider>
  );
};

export default App;
