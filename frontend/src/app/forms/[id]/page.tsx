'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Tabs, StatusBadge, Badge, Modal, Icon } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { useAuth } from '@/lib/auth-context';
import { toast } from '@/components/Toast';
import { FormBuilder } from '@/components/forms/FormBuilder';
import { SettingsTab } from '@/components/forms/SettingsTab';
import { ResponsesTab } from '@/components/forms/ResponsesTab';
import { ReportTab } from '@/components/forms/ReportTab';
import { parseSchema } from '@/lib/form-engine';
import type { FormSchemaEnvelope, FormTemplate, FormVersion } from '@/lib/types';

const EDIT_ROLES = ['Administrator', 'Marketing Manager', 'Marketing Analyst'];

interface PublishState {
  status: 'Draft' | 'Published' | 'Archived';
  latestVersion: number;
  latestVersionId: number;
  publishedVersion: number | null;
  publishedVersionId: number | null;
  hasUnpublishedChanges: boolean;
  canPublish: boolean;
}

function FormDetailInner({ id }: { id: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState('builder');
  const [envelope, setEnvelope] = useState<FormSchemaEnvelope | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [saveBusy, setSaveBusy] = useState(false);
  const saveLockRef = useRef(false);

  const { data: form, loading, error, reload } = useFetch<FormTemplate>(`/forms/${id}`);
  const latest = useFetch<FormVersion>(`/forms/${id}/versions/latest`);
  const publishState = useFetch<PublishState>(`/forms/${id}/publish-state`);
  const canEdit = user ? EDIT_ROLES.includes(user.role) : false;

  // Hydrate the builder when the latest version arrives.
  useEffect(() => {
    if (latest.data && envelope === null) {
      setEnvelope(parseSchema(latest.data.SchemaJSON));
    }
  }, [latest.data, envelope]);

  // After Settings saves branding/appearance, refresh the envelope's branding so a
  // later builder mount/autosave does not post a stale envelope without appearanceConfig.
  const refreshEnvelopeBranding = () => {
    void (async () => {
      try {
        const v = await api<FormVersion>(`/forms/${id}/versions/latest`);
        const parsed = parseSchema(v.SchemaJSON);
        setEnvelope((prev) => {
          if (!prev) return parsed;
          return {
            ...prev,
            branding: {
              ...prev.branding,
              appearanceConfig: parsed.branding?.appearanceConfig ?? prev.branding?.appearanceConfig,
              logoUrl: parsed.branding?.logoUrl ?? prev.branding?.logoUrl,
              theme: parsed.branding?.theme ?? prev.branding?.theme,
            },
          };
        });
      } catch {
        /* keep existing envelope */
      }
    })();
  };

  async function runSaveLocked(fn: () => Promise<void>): Promise<boolean> {
    if (saveLockRef.current) return false;
    saveLockRef.current = true;
    setSaveBusy(true);
    try {
      await fn();
      return true;
    } finally {
      saveLockRef.current = false;
      setSaveBusy(false);
    }
  }

  async function saveVersion() {
    if (!envelope) return;
    const ok = await runSaveLocked(async () => {
      await api(`/forms/${id}/versions`, { method: 'POST', body: { schema: envelope } });
      // Backend auto-promotes when Status === 'Published' (Option A).
      if (form?.Status === 'Published') {
        toast.success('Saved & published — changes are live');
      } else {
        toast.success('Schema version saved');
      }
      setSavedTick((t) => t + 1);
      void latest.reload();
      void publishState.reload();
      if (form?.Status === 'Published') void reload();
    });
    if (!ok) toast.error('A save is already in progress');
  }

  async function autosaveVersion(env: FormSchemaEnvelope) {
    const ok = await runSaveLocked(async () => {
      await api(`/forms/${id}/versions`, { method: 'POST', body: { schema: env } });
      setSavedTick((t) => t + 1);
      void latest.reload();
      void publishState.reload();
      if (form?.Status === 'Published') void reload();
    });
    if (!ok) throw new Error('A save is already in progress');
  }

  async function publish() {
    try {
      await api(`/forms/${id}/publish`, { method: 'POST' });
      toast.success('Form published — now open for responses');
      void reload();
      void latest.reload();
      void publishState.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Publish failed');
    }
  }

  async function archive() {
    try {
      await api(`/forms/${id}/archive`, { method: 'POST' });
      toast.success('Form archived');
      void reload();
      void publishState.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Archive failed');
    }
  }

  async function remove() {
    try {
      await api(`/forms/${id}`, { method: 'DELETE' });
      toast.success('Form deleted');
      router.push('/forms');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
      setConfirmDelete(false);
    }
  }

  if (loading) return <Loading />;
  if (error || !form) return <div className="alert alert-error">{error ?? 'Form not found'}</div>;

  const ps = publishState.data;
  const showPublishChanges = canEdit && form.Status === 'Published' && (ps?.hasUnpublishedChanges ?? false);

  const tabs = [
    { id: 'builder', label: 'Builder' },
    { id: 'settings', label: 'Settings' },
    { id: 'responses', label: 'Responses', badge: form.ResponseCount },
    { id: 'report', label: 'Report' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{form.Title}</h1>
          <div className="sub">
            <StatusBadge status={form.Status} /> · {form.AccessMode} access · Owned by {form.OwnerName}
            {form.MaxResponses ? ` · ${form.ResponseCount}/${form.MaxResponses} responses` : ` · ${form.ResponseCount} responses`}
            {form.Status === 'Published' && ps ? (
              <>
                {' · '}
                {ps.hasUnpublishedChanges
                  ? `v${ps.publishedVersion ?? '?'} live · v${ps.latestVersion} unpublished`
                  : `v${ps.latestVersion} live`}
              </>
            ) : null}
          </div>
        </div>
        <div className="actions">
          <TourTrigger tourId="form-builder" />
          {canEdit && form.Status === 'Published' ? <LinkButton href={`/forms/${id}/respond`}>Open as respondent</LinkButton> : null}
          {canEdit && form.Status === 'Published' && form.AccessMode === 'Public' ? <LinkButton href={`/forms/${id}/public`}>Open public form</LinkButton> : null}
          {canEdit && form.Status === 'Draft' ? <Button onClick={publish}>Publish</Button> : null}
          {showPublishChanges ? <Button onClick={publish}><Icon name="rocket" /> Publish changes</Button> : null}
          {canEdit && form.Status === 'Published' ? <Button variant="ghost" onClick={archive}>Archive</Button> : null}
          {canEdit && form.Status === 'Draft' ? <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}>Delete</Button> : null}
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'builder' ? (
        <>
          {canEdit ? (
            <>
              {envelope ? (
                <>
                  <FormBuilder
                    initial={envelope}
                    onChange={setEnvelope}
                    onDirtyChange={setDirty}
                    dirtyResetSignal={savedTick}
                    formId={id}
                    formTitle={form.Title}
                    formStatus={form.Status}
                    formVersion={form.CurrentVersion}
                    onAutosave={autosaveVersion}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                    {form.Status === 'Published' && ps?.hasUnpublishedChanges ? (
                      <span className="hint" style={{ color: 'var(--warning, #a96a0a)' }}>
                        Saved as v{ps.latestVersion} — click Publish changes to make it live.
                      </span>
                    ) : dirty ? (
                      <span className="hint">You have unsaved changes — save a version to keep them.</span>
                    ) : (
                      <span className="hint">All changes saved.</span>
                    )}
                    <Button
                      variant={dirty || form.Status === 'Published' ? 'primary' : 'ghost'}
                      busy={saveBusy}
                      onClick={() => void saveVersion()}
                    >
                      <Icon name="floppy-disk" /> Save version
                    </Button>
                  </div>
                </>
              ) : (
                <Loading />
              )}
            </>
          ) : (
            <Card title="Read-only view">
              <div className="empty">You do not have permission to edit forms. Contact the form owner.</div>
            </Card>
          )}
        </>
      ) : tab === 'settings' ? (
        <SettingsTab templateId={id} form={form} canEdit={canEdit} onChanged={() => { void reload(); void latest.reload(); void publishState.reload(); refreshEnvelopeBranding(); }} />
      ) : tab === 'responses' ? (
        <ResponsesTab templateId={id} />
      ) : (
        <ReportTab templateId={id} />
      )}

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete form"
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" onClick={remove}>Delete permanently</Button>
        </>}>
        <p>Only draft forms can be deleted. This cannot be undone. Continue?</p>
      </Modal>
    </>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return <Button variant="ghost" onClick={() => router.push(href)}>{children}</Button>;
}

export default function FormDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  return (
    <Guard>
      <FormDetailInner id={Number.isFinite(id) ? id : 0} />
    </Guard>
  );
}
