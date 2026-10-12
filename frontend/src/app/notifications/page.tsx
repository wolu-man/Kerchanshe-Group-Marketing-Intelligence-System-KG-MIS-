'use client';

import { useState } from 'react';
import { Guard } from '@/components/Guard';
import { Card, Loading, Empty, Badge, Button, Tabs, Icon, Pagination } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { useFetch } from '@/lib/use-api';
import { api } from '@/lib/api';
import { toast } from '@/components/Toast';
import { fmtDateTime } from '@/lib/format';
import type { NotificationRow } from '@/lib/types';

const EVENT_OPTIONS = [
  'NewReport', 'PriceGapAlert', 'SyncFailure', 'NewInterview',
  'FORM_PUBLISHED', 'OWNERSHIP_TRANSFERRED', 'PARENT_FORM_UPDATED',
  'SUBMISSION_CONFIRMED', 'NEW_RESPONSE_RECEIVED', 'RESPONSE_LIMIT_WARNING',
  'FORM_ASSIGNED', 'RESPONSE_EDITED',
];

function NotificationsInner() {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  const [eventFilter, setEventFilter] = useState('');

  const unreadCount = useFetch<{ count: number }>('/notifications/unread-count', []);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (tab === 'unread') params.set('unread', '1');
  if (eventFilter) params.set('event', eventFilter);

  const { data, loading, error, reload } = useFetch<{ items: NotificationRow[]; total: number }>(
    `/notifications/mine?${params}`, [page, tab, eventFilter]
  );

  async function markRead(id: number) {
    try {
      await api(`/notifications/${id}/read`, { method: 'PATCH' });
      toast.success('Marked as read');
      reload();
      unreadCount.reload();
    } catch {
      toast.error('Could not mark as read');
    }
  }

  async function markAllRead() {
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
      toast.success('All notifications marked as read');
      reload();
      unreadCount.reload();
    } catch {
      toast.error('Could not mark all as read');
    }
  }

  const tabs = [
    { id: 'unread', label: 'Unread', badge: unreadCount.data?.count ?? 0 },
    { id: 'all', label: 'All' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notification Center</h1>
            <div className="sub">Your email notifications and delivery history.</div>
          </div>
          <div className="actions">
            <TourTrigger tourId="notifications" />
          </div>
        </div>

      <div className="notif-toolbar">
        <Tabs tabs={tabs} active={tab} onChange={(id) => { setTab(id as 'unread' | 'all'); setPage(1); }} />
        <div className="spacer" />
        <select
          className="select"
          value={eventFilter}
          onChange={(e) => { setEventFilter(e.target.value); setPage(1); }}
          style={{ minWidth: 160 }}
        >
          <option value="">All events</option>
          {EVENT_OPTIONS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
        </select>
        {tab === 'unread' && (unreadCount.data?.count ?? 0) > 0 ? (
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            <Icon name="check-double" /> Mark all read
          </Button>
        ) : null}
      </div>

      <Card title={`${tab === 'unread' ? 'Unread' : 'All'} notifications (${data?.total ?? 0})`} flush>
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : data?.items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 24 }} />
                  <th>Event</th>
                  <th>Subject</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((n) => (
                  <tr
                    key={n.NotificationID}
                    className={n.IsRead ? 'tr-read' : 'tr-unread'}
                  >
                    <td>
                      {!n.IsRead ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => markRead(n.NotificationID)}
                          title="Mark as read"
                          style={{ padding: '2px 6px', fontSize: 12 }}
                        >
                          <Icon name="envelope-open" />
                        </button>
                      ) : null}
                    </td>
                    <td><Badge tone="neutral">{n.TriggerEvent}</Badge></td>
                    <td>{n.Subject ?? '—'}</td>
                    <td>{n.Channel}</td>
                    <td><Badge tone={n.Status === 'Sent' ? 'success' : n.Status === 'Failed' ? 'danger' : n.Status === 'Retried' ? 'warning' : 'neutral'}>{n.Status}</Badge></td>
                    <td>{n.Attempts}</td>
                    <td>{fmtDateTime(n.CreatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={tab === 'unread' ? 'bell-slash' : 'bell'}
            message={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          />
        )}
      </Card>

      <Pagination page={page} total={data?.total ?? 0} pageSize={20} onPageChange={setPage} />
    </>
  );
}

export default function NotificationsPage() {
  return (
    <Guard>
      <NotificationsInner />
    </Guard>
  );
}
