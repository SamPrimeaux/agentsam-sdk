/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Application Root View Switcher
 */

import React from 'react';
import { useAdmin } from './AdminProvider';
import { AdminShell } from '../shell/AdminShell';

// Features
import { HomeView } from '../features/home/HomeView';
import { OrdersView } from '../features/orders/OrdersView';
import { ProductsView } from '../features/products/ProductsView';
import { InventoryView } from '../features/inventory/InventoryView';
import { CustomersView } from '../features/customers/CustomersView';
import { GrowthView } from '../features/growth/GrowthView';
import { DiscountsView } from '../features/discounts/DiscountsView';
import { ContentView } from '../features/content/ContentView';
import { StoreThemeView } from '../features/store/StoreThemeView';
import { PagesView } from '../features/pages/PagesView';
import { ScaffoldView } from '../features/scaffold/ScaffoldView';
import { CompletefulConsoleView } from '../features/completeful/CompletefulConsoleView';
import { AgentSamWorkspaceView } from '../features/agentsam/AgentSamWorkspaceView';
import { EmailView } from '../features/email/EmailView';
import { AnalyticsView } from '../features/analytics/AnalyticsView';
import { ProviderCenterView } from '../features/providers/ProviderCenterView';

export const AdminApp: React.FC = () => {
  const { currentPath } = useAdmin();

  const renderCurrentView = () => {
    switch (currentPath) {
      case '/admin':
        return <HomeView />;
      case '/admin/orders':
        return <OrdersView />;
      case '/admin/products':
        return <ProductsView />;
      case '/admin/inventory':
        return <InventoryView />;
      case '/admin/customers':
        return <CustomersView />;
      case '/admin/growth':
        return <GrowthView />;
      case '/admin/discounts':
        return <DiscountsView />;
      case '/admin/content':
        return <ContentView />;
      case '/admin/store':
        return <StoreThemeView />;
      case '/admin/pages':
        return <PagesView />;
      case '/admin/scaffold':
        return <ScaffoldView />;
      case '/admin/completeful':
        return <CompletefulConsoleView />;
      case '/admin/agentsam':
        return <AgentSamWorkspaceView />;
      case '/admin/email':
        return <EmailView />;
      case '/admin/analytics':
        return <AnalyticsView />;
      case '/admin/providers':
        return <ProviderCenterView />;
      default:
        return <HomeView />;
    }
  };

  return <AdminShell>{renderCurrentView()}</AdminShell>;
};
