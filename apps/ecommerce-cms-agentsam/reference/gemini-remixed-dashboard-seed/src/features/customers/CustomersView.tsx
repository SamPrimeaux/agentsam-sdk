/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Customers & Subscribers View
 */

import React, { useState } from 'react';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { DataTable, Column } from '../../design-system/DataTable';
import { Users, Search, Mail, ShoppingBag, ArrowUpRight } from 'lucide-react';

interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  isSubscriber: boolean;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: number;
  location: string;
}

const INITIAL_CUSTOMERS: CustomerRecord[] = [
  {
    id: 'cus_01',
    name: 'Alex Vance',
    email: 'alex.vance@gmail.com',
    isSubscriber: true,
    orderCount: 4,
    totalSpent: 312.5,
    lastOrderDate: Date.now() - 1000 * 60 * 60 * 18,
    location: 'Springfield, OR'
  },
  {
    id: 'cus_02',
    name: 'Marcus Bell',
    email: 'marcus.motocross@yahoo.com',
    isSubscriber: true,
    orderCount: 2,
    totalSpent: 136.0,
    lastOrderDate: Date.now() - 1000 * 60 * 60 * 28,
    location: 'Charlotte, NC'
  },
  {
    id: 'cus_03',
    name: 'Casey Rider',
    email: 'casey.rider@icloud.com',
    isSubscriber: false,
    orderCount: 1,
    totalSpent: 42.0,
    lastOrderDate: Date.now() - 1000 * 60 * 60 * 4,
    location: 'Moab, UT'
  },
  {
    id: 'cus_04',
    name: 'Dave Henderson',
    email: 'dave.h@speedway.net',
    isSubscriber: true,
    orderCount: 6,
    totalSpent: 520.0,
    lastOrderDate: Date.now() - 86400000 * 5,
    location: 'Austin, TX'
  }
];

export const CustomersView: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerRecord[]>(INITIAL_CUSTOMERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubscriber, setFilterSubscriber] = useState<'all' | 'subscribers' | 'buyers'>('all');

  const filtered = customers.filter((c) => {
    const matchesQuery =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.location.toLowerCase().includes(searchQuery.toLowerCase());

    if (filterSubscriber === 'subscribers') return matchesQuery && c.isSubscriber;
    if (filterSubscriber === 'buyers') return matchesQuery && c.orderCount > 0;
    return matchesQuery;
  });

  const columns: Column<CustomerRecord>[] = [
    {
      key: 'name',
      header: 'Customer',
      render: (row) => (
        <div>
          <span className="font-semibold text-zinc-100 block">{row.name}</span>
          <span className="text-[11px] font-mono text-zinc-400">{row.email}</span>
        </div>
      )
    },
    {
      key: 'isSubscriber',
      header: 'Newsletter Status',
      render: (row) => (
        <Badge variant={row.isSubscriber ? 'emerald' : 'zinc'} size="sm" dot>
          {row.isSubscriber ? 'Subscribed' : 'Not Subscribed'}
        </Badge>
      )
    },
    {
      key: 'orderCount',
      header: 'Orders',
      render: (row) => (
        <span className="font-mono text-zinc-300 font-medium">
          {row.orderCount} {row.orderCount === 1 ? 'order' : 'orders'}
        </span>
      )
    },
    {
      key: 'totalSpent',
      header: 'Lifetime Spend',
      render: (row) => (
        <span className="font-mono font-bold text-amber-400">
          ${row.totalSpent.toFixed(2)}
        </span>
      )
    },
    {
      key: 'location',
      header: 'Location',
      render: (row) => <span className="text-zinc-400 text-xs">{row.location}</span>
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Customers & Subscribers
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Customer lifetime value, order histories, and Resend newsletter subscriber states.
          </p>
        </div>
      </div>

      <Card padding="sm" className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search name, email, or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-3.5 h-3.5" />}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {[
            { id: 'all', label: 'All Customers' },
            { id: 'subscribers', label: 'Newsletter Subscribers' },
            { id: 'buyers', label: 'Repeat Buyers' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterSubscriber(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                filterSubscriber === tab.id
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/80'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={(row) => row.id}
        emptyMessage="No customer records found."
        emptyIcon={<Users className="w-8 h-8" />}
      />
    </div>
  );
};
