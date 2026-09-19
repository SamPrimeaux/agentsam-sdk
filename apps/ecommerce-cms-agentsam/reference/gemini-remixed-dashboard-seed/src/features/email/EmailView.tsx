/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Email & Resend Communications View
 */

import React, { useState } from 'react';
import { useAdmin } from '../../app/AdminProvider';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Dialog } from '../../design-system/Dialog';
import {
  Mail,
  Send,
  Search,
  Plus,
  Inbox,
  CheckCircle2,
  Clock,
  User,
  ShieldCheck
} from 'lucide-react';
import { useToast } from '../../design-system/Toast';

interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  preview: string;
  body: string;
  mailbox: 'orders' | 'support' | 'marketing';
  timestamp: number;
  isRead: boolean;
}

const INITIAL_EMAILS: EmailMessage[] = [
  {
    id: 'em_01',
    from: 'orders@fuelnfreetime.com',
    to: 'alex.vance@gmail.com',
    subject: 'Order #FFT-9402 Confirmed - Completeful DTG Processing',
    preview: 'Thanks for your order! Your Heavyweight DTG Hoodies are being prepped...',
    body: 'Hey Alex,\n\nThanks for choosing Fuel & Free Time! Your order #FFT-9402 has been received and captured via Stripe. It is currently being processed at our Charlotte DTG fulfillment center.\n\nYou will receive carrier tracking as soon as it ships.\n\nKeep wrenching,\nF&FT Operations',
    mailbox: 'orders',
    timestamp: Date.now() - 1000 * 60 * 60 * 18,
    isRead: true
  },
  {
    id: 'em_02',
    from: 'support@fuelnfreetime.com',
    to: 'casey.rider@icloud.com',
    subject: 'Re: Sizing question on Vintage Washed Tees',
    preview: 'Our vintage tees feature a standard relaxed boxy cut...',
    body: 'Hi Casey,\n\nGreat question! Our vintage washed trackside tees are 6.5oz pre-shrunk cotton with a relaxed boxy cut. If you prefer an oversized fit, we recommend staying true to size.\n\nLet us know if you need anything else!\nF&FT Support',
    mailbox: 'support',
    timestamp: Date.now() - 1000 * 60 * 60 * 5,
    isRead: false
  },
  {
    id: 'em_03',
    from: 'marketing@fuelnfreetime.com',
    to: 'all-subscribers@fuelnfreetime.com',
    subject: '🏁 Fall 2026 Vintage Trackside Drop Now Live',
    preview: 'Heavyweight hoodies and vintage tees engineered for trackside wear...',
    body: 'Hey Riders,\n\nOur Fall apparel collection has officially arrived. Explore our heavyweight direct-to-garment fleece hoodies and vintage tees.\n\nUse code TRACKSIDE15 for 15% off during release week.',
    mailbox: 'marketing',
    timestamp: Date.now() - 86400000 * 2,
    isRead: true
  }
];

export const EmailView: React.FC = () => {
  const { host } = useAdmin();
  const { addToast } = useToast();
  const [emails, setEmails] = useState<EmailMessage[]>(INITIAL_EMAILS);
  const [activeMailbox, setActiveMailbox] = useState<'all' | 'orders' | 'support' | 'marketing'>('all');
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(INITIAL_EMAILS[0]);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSendEmail = async () => {
    if (!composeTo.trim() || !composeSubject.trim()) return;
    setIsSending(true);
    try {
      if (host.mail?.sendMessage) {
        await host.mail.sendMessage({
          mailbox: 'support',
          to: [composeTo.trim()],
          subject: composeSubject.trim(),
          bodyText: composeBody.trim()
        });
      }
      const newMsg: EmailMessage = {
        id: `em_${Date.now()}`,
        from: 'support@fuelnfreetime.com',
        to: composeTo.trim(),
        subject: composeSubject.trim(),
        preview: composeBody.substring(0, 60),
        body: composeBody,
        mailbox: 'support',
        timestamp: Date.now(),
        isRead: true
      };
      setEmails([newMsg, ...emails]);
      setSelectedEmail(newMsg);
      setIsComposeOpen(false);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      addToast({
        type: 'success',
        title: 'Email Transmitted via Resend',
        description: `Dispatched message to ${composeTo}.`
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Send Failed', description: err.message });
    } finally {
      setIsSending(false);
    }
  };

  const filtered = emails.filter(
    (e) => activeMailbox === 'all' || e.mailbox === activeMailbox
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Email & Resend Communications
            </h1>
            <Badge variant="emerald" size="sm" dot>
              Resend Host Connected
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage transactional receipts, customer support threads, and broadcast drop newsletters.
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setIsComposeOpen(true)}
        >
          Compose Message
        </Button>
      </div>

      {/* Mailbox Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {[
          { id: 'all', label: 'All Messages' },
          { id: 'orders', label: 'Order Notifications' },
          { id: 'support', label: 'Support Inquiries' },
          { id: 'marketing', label: 'Marketing Broadcasts' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveMailbox(tab.id as any)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              activeMailbox === tab.id
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Split Pane: Inbox List + Detail Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Messages List */}
        <Card padding="none" className="lg:col-span-5 divide-y divide-zinc-800/80 overflow-hidden">
          {filtered.map((msg) => {
            const isSelected = selectedEmail?.id === msg.id;
            return (
              <button
                key={msg.id}
                type="button"
                onClick={() => setSelectedEmail(msg)}
                className={`w-full p-4 text-left transition-colors flex flex-col gap-1.5 ${
                  isSelected ? 'bg-zinc-900' : 'hover:bg-zinc-900/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-zinc-200 truncate">{msg.to}</span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {new Date(msg.timestamp).toLocaleDateString()}
                  </span>
                </div>

                <span className="text-xs font-medium text-zinc-100 line-clamp-1">{msg.subject}</span>
                <span className="text-[11px] text-zinc-400 line-clamp-1">{msg.preview}</span>

                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="zinc" size="sm">
                    {msg.mailbox}
                  </Badge>
                  {!msg.isRead && (
                    <span className="w-2 h-2 rounded-full bg-amber-400" title="Unread" />
                  )}
                </div>
              </button>
            );
          })}
        </Card>

        {/* Selected Message Detail View */}
        <Card padding="lg" className="lg:col-span-7 flex flex-col justify-between min-h-[420px]">
          {selectedEmail ? (
            <div className="space-y-4">
              <div className="border-b border-zinc-800 pb-3 space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-zinc-100">{selectedEmail.subject}</h3>
                  <Badge variant="emerald" size="sm">
                    Delivered
                  </Badge>
                </div>
                <div className="text-xs font-mono text-zinc-400 flex flex-wrap gap-x-4">
                  <span>From: {selectedEmail.from}</span>
                  <span>To: {selectedEmail.to}</span>
                  <span>Sent: {new Date(selectedEmail.timestamp).toLocaleString()}</span>
                </div>
              </div>

              <div className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans p-2">
                {selectedEmail.body}
              </div>
            </div>
          ) : (
            <div className="py-20 text-center text-zinc-500 text-xs">
              Select an email to view contents.
            </div>
          )}
        </Card>
      </div>

      {/* Compose Dialog */}
      <Dialog
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        title="Compose Message via Resend"
        subtitle="Dispatches transactional or direct support email via Resend API"
        maxWidth="md"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] font-mono text-zinc-500">From: support@fuelnfreetime.com</span>
            <div className="flex items-center gap-2">
              <Button size="xs" variant="outline" onClick={() => setIsComposeOpen(false)}>
                Cancel
              </Button>
              <Button
                size="xs"
                variant="primary"
                isLoading={isSending}
                icon={<Send className="w-3.5 h-3.5" />}
                onClick={handleSendEmail}
              >
                Send Message
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="Recipient Email"
            placeholder="customer@example.com"
            value={composeTo}
            onChange={(e) => setComposeTo(e.target.value)}
          />
          <Input
            label="Subject"
            placeholder="Order Update / Question"
            value={composeSubject}
            onChange={(e) => setComposeSubject(e.target.value)}
          />
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Body Text</label>
            <textarea
              rows={5}
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              placeholder="Write your email here..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-sans"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
};
