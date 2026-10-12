import { useEffect, useState, useMemo } from 'react';
import { Button, Card, Field, Loading, Badge, Empty, Icon, Tabs, Modal } from '@/components/ui';
import { FormRenderer } from './FormRenderer';
import { api, ApiError } from '@/lib/api';
import { useFetch, runPut } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { fmtDateTime } from '@/lib/format';
import { parseSchema } from '@/lib/form-engine';
import type { FormBranding, FormTemplate, AccessRule, Invite, ReportAccessRow, ConsentHistoryRow, AdminUser, AppearanceConfig, FormVersion, FormSchemaEnvelope } from '@/lib/types';
import { getDefaultAppearanceConfig } from '@/lib/appearance-defaults';

const ACCESS_MODES = ['Public', 'Domain', 'Invite', 'Group', 'Password'];

/** ISO/UTC timestamp → local `datetime-local` value (YYYY-MM-DDTHH:mm). */
function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function metaFromForm(form: FormTemplate) {
  return {
    title: form.Title,
    description: form.Description ?? '',
    maxResponses: form.MaxResponses?.toString() ?? '',
    gdprConsentRequired: form.GDPRConsentRequired,
    publishAt: toLocalInput(form.PublishAt),
    expireAt: toLocalInput(form.ExpireAt),
    linkedFormTemplateId: form.LinkedFormTemplateID?.toString() ?? '',
    editWindowHours: form.EditWindowHours?.toString() ?? '',
    autoRejectAnomalies: form.AutoRejectAnomalies,
    allowDrafts: form.AllowDrafts,
  };
}

export function SettingsTab({ templateId, form, canEdit, onChanged }: {
  templateId: number;
  form: FormTemplate;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState('settings');

  // Re-hydrate local meta state whenever the parent reloads the form prop
  // (after saveMeta / onChanged / external updates).
  const [meta, setMeta] = useState(() => metaFromForm(form));
  useEffect(() => {
    setMeta(metaFromForm(form));
  }, [form]);
  const [error, setError] = useState<string | null>(null);

  const access = useFetch<AccessRule>(`/forms/${templateId}/access`);
  const invites = useFetch<{ items: Invite[] }>(`/forms/${templateId}/invites`);
  const consent = useFetch<{ consentRequired: boolean; consentVersion: number; consentText: string | null }>(`/forms/${templateId}/consent`);
  const consentHistory = useFetch<{ items: ConsentHistoryRow[] }>(`/forms/${templateId}/consent/history`);
  const branding = useFetch<FormBranding | null>(`/forms/${templateId}/branding`);
  const latestVersion = useFetch<FormVersion>(`/forms/${templateId}/versions/latest`);
  const reportAccess = useFetch<{ items: ReportAccessRow[] }>(`/forms/${templateId}/report-access`);
  const children = useFetch<{ items: FormTemplate[] }>(`/forms/${templateId}/children`);
  const adminUsers = useFetch<{ items: AdminUser[] }>(`/admin/users`);

  // Real form schema for Appearance live preview (falls back to a minimal
  // placeholder only while the latest version is still loading).
  const schemaEnvelope = useMemo<FormSchemaEnvelope>(() => {
    if (latestVersion.data?.SchemaJSON) return parseSchema(latestVersion.data.SchemaJSON);
    return {
      schemaVersion: 2,
      pages: [{ id: 'page-1', title: 'Page 1' }],
      elements: [],
      branding: undefined,
    };
  }, [latestVersion.data]);

  const [accessMode, setAccessMode] = useState<string>(form.AccessMode);
  const [domains, setDomains] = useState('');
  const [roles, setRoles] = useState('');
  const [password, setPassword] = useState('');
  const [groupId, setGroupId] = useState('');

  const [newInvite, setNewInvite] = useState('');
  const [bulkInvites, setBulkInvites] = useState('');

  // consent editor
  const [consentText, setConsentText] = useState('');
  const [consentMsg, setConsentMsg] = useState<string | null>(null);

  // branding editor
  const [b, setB] = useState<FormBranding>({});

  // appearance editor
  const [appearanceConfig, setAppearanceConfig] = useState<AppearanceConfig>(() =>
    branding.data?.appearanceConfig ?? getDefaultAppearanceConfig()
  );
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<'header' | 'watermark' | 'footer' | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function handleAppearanceChange(path: string, value: any) {
    setAppearanceConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev || getDefaultAppearanceConfig()));
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = obj[keys[i]] || {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  }

  function openUploadModal(target: 'header' | 'watermark' | 'footer') {
    setUploadTarget(target);
    setUploadError(null);
    setUploadModalOpen(true);
    setUploadProgress(0);
  }

  async function handleImageUpload(file: File) {
    if (!uploadTarget) return;
    setUploadProgress(10);
    setUploadError(null);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await api<{ url: string; filename: string }>(
        `/forms/${templateId}/appearance/upload`,
        { method: 'POST', body: formData }
      );
      setUploadProgress(100);
      const field = uploadTarget === 'footer' ? 'logoUrl' : 'imageUrl';
      handleAppearanceChange(`${uploadTarget}.${field}`, res.url);
      toast.success('Image uploaded');
      setUploadModalOpen(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Upload failed';
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setUploadProgress(0);
    }
  }

  // report access
  const [grantUserId, setGrantUserId] = useState('');
  const [grantLevel, setGrantLevel] = useState<'View' | 'Export'>('View');

  // children
  const [childTitle, setChildTitle] = useState('');

  // Hydrate access config when the rule loads.
  useEffect(() => {
    if (access.data) {
      setAccessMode(access.data.Mode);
      try {
        const cfg = access.data.ConfigJSON ? (JSON.parse(access.data.ConfigJSON) as Record<string, unknown>) : {};
        setDomains(Array.isArray(cfg.domains) ? (cfg.domains as string[]).join('\n') : '');
        setRoles(Array.isArray(cfg.roles) ? (cfg.roles as string[]).join('\n') : '');
        setGroupId(typeof cfg.groupId === 'string' ? cfg.groupId : '');
      } catch {
        /* ignore malformed config */
      }
    }
  }, [access.data]);

  useEffect(() => {
    if (consent.data) setConsentText(consent.data.consentText ?? '');
  }, [consent.data]);

  useEffect(() => {
    if (branding.data) {
      setB(branding.data);
      setAppearanceConfig(branding.data.appearanceConfig ?? getDefaultAppearanceConfig());
    }
  }, [branding.data]);

  function resetError() { setError(null); }

  async function saveMeta() {
    resetError();
    const body: Record<string, unknown> = {
      title: meta.title.trim(),
      description: meta.description.trim() || null,
      maxResponses: meta.maxResponses ? Number(meta.maxResponses) : null,
      gdprConsentRequired: meta.gdprConsentRequired,
      publishAt: meta.publishAt ? new Date(meta.publishAt).toISOString() : null,
      expireAt: meta.expireAt ? new Date(meta.expireAt).toISOString() : null,
      linkedFormTemplateId: meta.linkedFormTemplateId ? Number(meta.linkedFormTemplateId) : null,
      editWindowHours: meta.editWindowHours ? Number(meta.editWindowHours) : null,
      autoRejectAnomalies: meta.autoRejectAnomalies,
      allowDrafts: meta.allowDrafts,
    };
    const res = await runPut(`/forms/${templateId}`, body);
    if (res.ok) { toast.success('Changes saved'); onChanged(); }
    else toast.error(res.error ?? 'Save failed');
  }

  async function saveAccess() {
    resetError();
    const config: Record<string, unknown> = {};
    if (accessMode === 'Domain') config.domains = domains.split('\n').map((s) => s.trim()).filter(Boolean);
    if (accessMode === 'Group') { config.roles = roles.split('\n').map((s) => s.trim()).filter(Boolean); if (groupId) config.groupId = groupId; }
    // Password mode: only send the password when the user typed a new one —
    // the backend preserves the existing hash when password is omitted.
    if (accessMode === 'Password' && password) config.password = password;
    const res = await runPut(`/forms/${templateId}/access`, { mode: accessMode as FormTemplate['AccessMode'], config });
    if (res.ok) {
      toast.success('Access rule saved');
      setPassword('');
      void access.reload();
      onChanged();
    } else toast.error(res.error ?? 'Save failed');
  }

  async function addInvite() {
    if (!newInvite.trim()) return;
    try {
      await api(`/forms/${templateId}/invites`, { method: 'POST', body: { email: newInvite.trim() } });
      setNewInvite('');
      toast.success('Invite added');
      void invites.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Invite failed');
    }
  }

  async function bulkAdd() {
    const emails = bulkInvites.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
    if (!emails.length) return;
    try {
      await api(`/forms/${templateId}/invites/bulk`, { method: 'POST', body: { emails } });
      setBulkInvites('');
      toast.success(`${emails.length} invite${emails.length === 1 ? '' : 's'} added`);
      void invites.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Bulk add failed');
    }
  }

  async function revoke(inviteId: number) {
    try {
      await api(`/forms/invites/${inviteId}`, { method: 'DELETE' });
      toast.success('Invite revoked');
      void invites.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Revoke failed');
    }
  }

  async function saveConsent() {
    setConsentMsg(null);
    try {
      await api(`/forms/${templateId}/consent`, { method: 'PUT', body: { consentText: consentText.trim() } });
      setConsentMsg(`Consent text saved — version bumped to v${(consent.data?.consentVersion ?? 0) + 1}.`); // version incremented server-side
      toast.success('Consent text saved — version bumped');
      void consent.reload();
      void consentHistory.reload();
    } catch (err) {
      setConsentMsg(err instanceof ApiError ? err.message : 'Save failed');
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  async function saveBranding() {
    const clean: FormBranding = {};
    if (b.logoUrl?.trim()) clean.logoUrl = b.logoUrl.trim();
    if (b.primaryColor?.trim()) clean.primaryColor = b.primaryColor.trim();
    if (b.secondaryColor?.trim()) clean.secondaryColor = b.secondaryColor.trim();
    if (b.fontFamily?.trim()) clean.fontFamily = b.fontFamily.trim();
    if (b.thankYou && (b.thankYou.title?.trim() || b.thankYou.message?.trim())) {
      clean.thankYou = { title: b.thankYou.title?.trim() || undefined, message: b.thankYou.message?.trim() || undefined, showResponseId: b.thankYou.showResponseId, redirectUrl: b.thankYou.redirectUrl?.trim() || undefined };
    }
    if (b.theme) clean.theme = b.theme;
    if (b.appearanceConfig ?? appearanceConfig) clean.appearanceConfig = b.appearanceConfig ?? appearanceConfig;
    try {
      await api(`/forms/${templateId}/branding`, { method: 'PUT', body: { branding: clean } });
      toast.success('Branding saved');
      void branding.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  // appearance branding for preview (combines existing branding with appearanceConfig)
  const appearanceBranding = useMemo(
    () => ({
      ...b,
      appearanceConfig,
    }),
    [b, appearanceConfig]
  );

  // Real form schema + live appearance branding for the sticky Live Preview.
  const previewEnvelope = useMemo(
    () => ({
      ...schemaEnvelope,
      branding: appearanceBranding,
    }),
    [schemaEnvelope, appearanceBranding]
  );

  async function saveAppearance() {
    const brandingToSave = { ...b, appearanceConfig };
    try {
      await api(`/forms/${templateId}/branding`, { method: 'PUT', body: { branding: brandingToSave } });
      toast.success('Appearance saved');
      void branding.reload();
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  async function grantAccess() {
    const uid = Number(grantUserId);
    if (!uid) return;
    try {
      await api(`/forms/${templateId}/report-access`, { method: 'POST', body: { userId: uid, accessLevel: grantLevel } });
      const name = (adminUsers.data?.items ?? []).find((u) => u.UserID === uid)?.Name;
      setGrantUserId('');
      toast.success(`Access granted to ${name ?? `user #${uid}`}`);
      void reportAccess.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Grant failed');
    }
  }

  async function revokeAccess(uid: number) {
    try {
      await api(`/forms/${templateId}/report-access/${uid}`, { method: 'DELETE' });
      toast.success('Access revoked');
      void reportAccess.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Revoke failed');
    }
  }

  async function createChild() {
    if (!childTitle.trim()) return;
    try {
      await api(`/forms/${templateId}/children`, { method: 'POST', body: { title: childTitle.trim() } });
      setChildTitle('');
      toast.success('Child form created — customize it before publishing.');
      void children.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Create failed');
    }
  }

  async function propagate() {
    try {
      await api(`/forms/${templateId}/propagate`, { method: 'POST' });
      toast.success('Parent schema pushed to all children.');
      void children.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Propagate failed');
    }
  }

  if (!canEdit) {
    return <Card title="Settings"><div className="empty">You do not have permission to change settings.</div></Card>;
  }

  return (
    <div>
      <Tabs
        tabs={[
          { id: 'settings', label: 'Form & access' },
          { id: 'consent', label: 'Consent', badge: consent.data?.consentVersion ?? 0 },
          { id: 'appearance', label: 'Appearance' },
          { id: 'access', label: 'Report sharing' },
          { id: 'children', label: 'Child forms', badge: children.data?.items.length ?? 0 },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'settings' ? (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div>
            {error ? <div className="alert alert-error">{error}</div> : null}

            <Card title="Form details">
              <Field label="Title" required>
                <input className="input" value={meta.title} onChange={(e) => { setMeta({ ...meta, title: e.target.value }); resetError(); }} />
              </Field>
              <Field label="Description">
                <textarea className="textarea" value={meta.description} onChange={(e) => { setMeta({ ...meta, description: e.target.value }); resetError(); }} />
              </Field>
              <div className="form-row">
                <Field label="Max responses (blank = unlimited)">
                  <input className="input" type="number" min="1" value={meta.maxResponses} onChange={(e) => { setMeta({ ...meta, maxResponses: e.target.value }); resetError(); }} />
                </Field>
                <Field label="Linked follow-up form ID (optional)">
                  <input className="input" type="number" min="1" value={meta.linkedFormTemplateId} onChange={(e) => { setMeta({ ...meta, linkedFormTemplateId: e.target.value }); resetError(); }} />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Opens at (local)">
                  <input className="input" type="datetime-local" value={meta.publishAt} onChange={(e) => { setMeta({ ...meta, publishAt: e.target.value }); resetError(); }} />
                </Field>
                <Field label="Closes at (local)">
                  <input className="input" type="datetime-local" value={meta.expireAt} onChange={(e) => { setMeta({ ...meta, expireAt: e.target.value }); resetError(); }} />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Edit window (hours, blank = unlimited)" hint="How long respondents can edit a submitted response after submitting">
                  <input className="input" type="number" min="1" value={meta.editWindowHours} onChange={(e) => { setMeta({ ...meta, editWindowHours: e.target.value }); resetError(); }} />
                </Field>
                <Field label="Draft retention">
                  <div className="hint" style={{ paddingTop: 8 }}>Drafts are auto-purged after 7 days.</div>
                </Field>
              </div>
              <label className="checkbox-row" style={{ marginBottom: 8 }}>
                <input type="checkbox" checked={meta.gdprConsentRequired} onChange={(e) => { setMeta({ ...meta, gdprConsentRequired: e.target.checked }); resetError(); }} />
                Require GDPR data-processing consent on submission
              </label>
              <label className="checkbox-row" style={{ marginBottom: 8 }}>
                <input type="checkbox" checked={meta.allowDrafts} onChange={(e) => { setMeta({ ...meta, allowDrafts: e.target.checked }); resetError(); }} />
                Allow respondents to save drafts and resume later
              </label>
              <label className="checkbox-row" style={{ marginBottom: 14 }}>
                <input type="checkbox" checked={meta.autoRejectAnomalies} onChange={(e) => { setMeta({ ...meta, autoRejectAnomalies: e.target.checked }); resetError(); }} />
                Automatically reject responses flagged as anomalies
              </label>
              <Button onClick={saveMeta}>Save details</Button>
            </Card>

            <Card title="Access rule" style={{ marginTop: 16 }}>
              <Field label="Access mode">
                <select className="select" value={accessMode} onChange={(e) => setAccessMode(e.target.value)}>
                  {ACCESS_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              {accessMode === 'Domain' ? (
                <Field label="Allowed email domains (one per line)" hint="e.g. kerchanshe.com">
                  <textarea className="textarea" value={domains} onChange={(e) => setDomains(e.target.value)} />
                </Field>
              ) : null}
              {accessMode === 'Group' ? (
                <>
                  <Field label="Allowed roles (one per line)" hint="e.g. Field Officer">
                    <textarea className="textarea" value={roles} onChange={(e) => setRoles(e.target.value)} />
                  </Field>
                  <Field label="Group id (optional)">
                    <input className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)} />
                  </Field>
                </>
              ) : null}
              {accessMode === 'Password' ? (
                <Field label="Password (set/reset)" hint="Respondents must enter this to open the form">
                  <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" />
                </Field>
              ) : null}
              <Button onClick={saveAccess}>Save access rule</Button>

              {(form.AccessMode === 'Public' || accessMode === 'Public') && (
                <div style={{ marginTop: 16, padding: 12, background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Public Form Link</div>
                  <div className="hint" style={{ marginBottom: 8 }}>Anyone with this link can fill the form without login (anonymous submissions):</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input 
                      type="text" 
                      value={`${window.location.origin}/forms/${form.TemplateID}/public`} 
                      readOnly 
                      style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }}
                    />
                    <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/forms/${form.TemplateID}/public`)}>
                      <Icon name="copy" /> Copy
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card title="Invite list">
            {invites.loading ? <Loading /> : null}
            <div className="form-row">
              <Field label="Add invite">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" type="email" value={newInvite} onChange={(e) => setNewInvite(e.target.value)} placeholder="email@kerchanshe.com" />
                  <Button variant="ghost" onClick={addInvite}>Add</Button>
                </div>
              </Field>
              <Field label="Bulk add (comma / newline separated)">
                <div style={{ display: 'flex', gap: 8 }}>
                  <textarea className="textarea" style={{ minHeight: 36 }} value={bulkInvites} onChange={(e) => setBulkInvites(e.target.value)} />
                  <Button variant="ghost" onClick={bulkAdd}>Add</Button>
                </div>
              </Field>
            </div>
            {invites.data?.items.length ? (
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead><tr><th>Email</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {invites.data.items.map((i) => (
                      <tr key={i.InviteID}>
                        <td>{i.Email}</td>
                        <td><Badge tone={i.Status === 'Revoked' ? 'neutral' : 'info'}>{i.Status}</Badge></td>
                        <td>{i.Status !== 'Revoked' ? <Button variant="danger-ghost" size="sm" onClick={() => void revoke(i.InviteID)}>Revoke</Button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty icon="envelope-open" message="No invites yet" />
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'consent' ? (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <Card title="Consent text & versioning">
            {consent.loading ? <Loading /> : consent.data ? (
              <>
                <p className="hint" style={{ marginBottom: 10 }}>
                  Current version <b>v{consent.data.consentVersion}</b>. Editing the text creates a new version; responses submitted
                  under the old version keep their recorded consent version for audit.
                </p>
                {consentMsg ? <div className={`alert ${consentMsg.includes('failed') || consentMsg.includes('required') ? 'alert-error' : 'alert-success'}`}>{consentMsg}</div> : null}
                <Field label="Consent text" required>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 110 }}
                    value={consentText}
                    onChange={(e) => { setConsentText(e.target.value); setConsentMsg(null); }}
                  />
                </Field>
                <Button onClick={saveConsent} disabled={!consentText.trim()}>
                  <Icon name="scale-balanced" /> Save & bump version
                </Button>
              </>
            ) : (
              <Loading />
            )}
          </Card>
          <Card title="Consent history">
            {consentHistory.loading ? <Loading /> : consentHistory.data?.items.length ? (
              <table className="table">
                <thead><tr><th>Version</th><th>Effective</th><th>Changed by</th></tr></thead>
                <tbody>
                  {consentHistory.data.items.map((h) => (
                    <tr key={h.ConsentHistoryID}>
                      <td><Badge tone="primary">v{h.ConsentVersion}</Badge></td>
                      <td>{fmtDateTime(h.EffectiveAt)}</td>
                      <td>{h.ChangedBy ? `User #${h.ChangedBy}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty icon="history" message="No consent versions yet" />
            )}
            {consent.data && !consent.data.consentRequired ? (
              <p className="hint" style={{ marginTop: 10 }}>Consent is currently NOT required (off in Form details).</p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === 'appearance' ? (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* LIVE PREVIEW - RIGHT COLUMN (sticky) */}
          <Card title="Live Preview" style={{ position: 'sticky', top: 20, maxHeight: 'calc(100vh - 140px)', overflow: 'auto' }}>
            <FormRenderer
              envelope={previewEnvelope}
              branding={appearanceBranding}
              answers={{}}
              setAnswers={() => {}}
              editable={false}
              allowDrafts={false}
            />
          </Card>

          {/* LEFT COLUMN - SETTINGS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 1. HEADER / BANNER */}
            <Card title="Header / Banner">
              <Field label="Enable header">
                <label className="checkbox-row">
                  <input type="checkbox" checked={appearanceConfig?.header?.enabled} onChange={(e) => handleAppearanceChange('header.enabled', e.target.checked)} />
                  Show header banner
                </label>
              </Field>
              {appearanceConfig?.header?.enabled && (
                <>
                  <Field label="Banner image">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input className="input" value={appearanceConfig?.header?.imageUrl ?? ''} onChange={(e) => handleAppearanceChange('header.imageUrl', e.target.value)} placeholder="https://example.com/banner.jpg" />
                      <button type="button" className="btn btn-primary" onClick={() => openUploadModal('header')}>
                        <Icon name="upload" /> Upload Image
                      </button>
                    </div>
                  </Field>
                  <div className="form-row">
                    <Field label="Height">
                      <select className="select" value={appearanceConfig?.header?.height ?? 'medium'} onChange={(e) => handleAppearanceChange('header.height', e.target.value)}>
                        <option value="small">Small (80px)</option>
                        <option value="medium">Medium (160px)</option>
                        <option value="large">Large (240px)</option>
                      </select>
                    </Field>
                    <Field label="Fit">
                      <select className="select" value={appearanceConfig?.header?.fit ?? 'cover'} onChange={(e) => handleAppearanceChange('header.fit', e.target.value)}>
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Position">
                    <select className="select" value={appearanceConfig?.header?.position ?? 'center'} onChange={(e) => handleAppearanceChange('header.position', e.target.value)}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </Field>
                </>
              )}
            </Card>

            {/* 2. WATERMARK */}
            <Card title="Watermark">
              <Field label="Enable watermark">
                <label className="checkbox-row">
                  <input type="checkbox" checked={appearanceConfig?.watermark?.enabled} onChange={(e) => handleAppearanceChange('watermark.enabled', e.target.checked)} />
                  Show watermark
                </label>
              </Field>
              {appearanceConfig?.watermark?.enabled && (
                <>
                  <Field label="Type">
                    <select className="select" value={appearanceConfig?.watermark?.type ?? 'text'} onChange={(e) => handleAppearanceChange('watermark.type', e.target.value)}>
                      <option value="image">Image</option>
                      <option value="text">Text</option>
                    </select>
                  </Field>
                  {appearanceConfig?.watermark?.type === 'image' && (
                    <Field label="Image URL">
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input className="input" value={appearanceConfig?.watermark?.imageUrl ?? ''} onChange={(e) => handleAppearanceChange('watermark.imageUrl', e.target.value)} placeholder="https://example.com/watermark.png" />
                        <button type="button" className="btn btn-primary" onClick={() => openUploadModal('watermark')}>
                          <Icon name="upload" /> Upload Image
                        </button>
                      </div>
                    </Field>
                  )}
                  {appearanceConfig?.watermark?.type === 'text' && (
                    <Field label="Text" hint="Supports placeholders: {{responseId}}, {{date}}, {{time}}, {{datetime}}">
                      <input className="input" value={appearanceConfig?.watermark?.text ?? ''} onChange={(e) => handleAppearanceChange('watermark.text', e.target.value)} placeholder="CONFIDENTIAL - {{responseId}} - {{date}}" />
                    </Field>
                  )}
                  <div className="form-row">
                    <Field label="Position">
                      <select className="select" value={appearanceConfig?.watermark?.position ?? 'center'} onChange={(e) => handleAppearanceChange('watermark.position', e.target.value)}>
                        <option value="center">Center</option>
                        <option value="top-left">Top Left</option>
                        <option value="top-right">Top Right</option>
                        <option value="bottom-left">Bottom Left</option>
                        <option value="bottom-right">Bottom Right</option>
                        <option value="repeat">Repeat (pattern)</option>
                      </select>
                    </Field>
                    <Field label="Opacity">
                      <input type="range" min="0" max="1" step="0.05" value={appearanceConfig?.watermark?.opacity ?? 0.1} onChange={(e) => handleAppearanceChange('watermark.opacity', parseFloat(e.target.value))} />
                    </Field>
                  </div>
                  <div className="form-row">
                    <Field label="Size (%)">
                      <input type="number" min="10" max="200" value={appearanceConfig?.watermark?.size ?? 100} onChange={(e) => handleAppearanceChange('watermark.size', Number(e.target.value))} />
                    </Field>
                    <Field label="Rotation (°)">
                      <input type="number" min="-180" max="180" value={appearanceConfig?.watermark?.rotation ?? -45} onChange={(e) => handleAppearanceChange('watermark.rotation', Number(e.target.value))} />
                    </Field>
                  </div>
                </>
              )}
            </Card>

            {/* 3. BODY BACKGROUND */}
            <Card title="Body Background">
              <Field label="Background type">
                <select className="select" value={appearanceConfig?.bodyBackground?.type ?? 'default'} onChange={(e) => handleAppearanceChange('bodyBackground.type', e.target.value)}>
                  <option value="default">Default</option>
                  <option value="solid">Solid Color</option>
                  <option value="gradient">Gradient</option>
                </select>
              </Field>
              {appearanceConfig?.bodyBackground?.type === 'solid' && (
                <Field label="Color">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="color" value={appearanceConfig?.bodyBackground?.color ?? '#ffffff'} onChange={(e) => handleAppearanceChange('bodyBackground.color', e.target.value)} />
                    <input className="input mono" value={appearanceConfig?.bodyBackground?.color ?? '#ffffff'} onChange={(e) => handleAppearanceChange('bodyBackground.color', e.target.value)} />
                  </div>
                </Field>
              )}
              {appearanceConfig?.bodyBackground?.type === 'gradient' && (
                <>
                  <Field label="Start color">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="color" value={appearanceConfig?.bodyBackground?.gradientStart ?? '#0047ab'} onChange={(e) => handleAppearanceChange('bodyBackground.gradientStart', e.target.value)} />
                    </div>
                  </Field>
                  <Field label="End color">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="color" value={appearanceConfig?.bodyBackground?.gradientEnd ?? '#00843d'} onChange={(e) => handleAppearanceChange('bodyBackground.gradientEnd', e.target.value)} />
                    </div>
                  </Field>
                  <Field label="Direction">
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {[
                        { deg: 0, label: '→', title: 'Left to Right' },
                        { deg: 45, label: '↗', title: 'Bottom-Left to Top-Right' },
                        { deg: 90, label: '↑', title: 'Bottom to Top' },
                        { deg: 135, label: '↖', title: 'Bottom-Right to Top-Left' },
                        { deg: 180, label: '←', title: 'Right to Left' },
                        { deg: 225, label: '↙', title: 'Top-Right to Bottom-Left' },
                        { deg: 270, label: '↓', title: 'Top to Bottom' },
                        { deg: 315, label: '↘', title: 'Top-Left to Bottom-Right' },
                      ].map(({ deg, label, title }) => (
                        <button
                          key={deg}
                          type="button"
                          className={`btn btn-ghost btn-sm ${appearanceConfig?.bodyBackground?.gradientDirection === deg ? 'active' : ''}`}
                          onClick={() => handleAppearanceChange('bodyBackground.gradientDirection', deg)}
                          title={title}
                          style={{ width: 36, height: 36, fontSize: 14 }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              )}
            </Card>

            {/* 4. FOOTER */}
            <Card title="Footer">
              <Field label="Enable footer">
                <label className="checkbox-row">
                  <input type="checkbox" checked={appearanceConfig?.footer?.enabled} onChange={(e) => handleAppearanceChange('footer.enabled', e.target.checked)} />
                  Show footer
                </label>
              </Field>
              {appearanceConfig?.footer?.enabled && (
                <>
                  <Field label="Footer text">
                    <textarea className="textarea" value={appearanceConfig?.footer?.text ?? ''} onChange={(e) => handleAppearanceChange('footer.text', e.target.value)} />
                  </Field>
                  <Field label="Footer logo">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input className="input" value={appearanceConfig?.footer?.logoUrl ?? ''} onChange={(e) => handleAppearanceChange('footer.logoUrl', e.target.value)} placeholder="https://example.com/logo.png" />
                      <button type="button" className="btn btn-primary" onClick={() => openUploadModal('footer')}>
                        <Icon name="upload" /> Upload Image
                      </button>
                    </div>
                  </Field>
                  <div className="form-row">
                    <Field label="Background color">
                      <input type="color" value={appearanceConfig?.footer?.backgroundColor ?? '#f3f4f6'} onChange={(e) => handleAppearanceChange('footer.backgroundColor', e.target.value)} />
                    </Field>
                    <Field label="Text color">
                      <input type="color" value={appearanceConfig?.footer?.textColor ?? '#6b7280'} onChange={(e) => handleAppearanceChange('footer.textColor', e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Text alignment">
                    <select className="select" value={appearanceConfig?.footer?.textAlign ?? 'center'} onChange={(e) => handleAppearanceChange('footer.textAlign', e.target.value)}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </Field>
                  <Field label="Copyright text">
                    <input className="input" value={appearanceConfig?.footer?.copyrightText ?? ''} onChange={(e) => handleAppearanceChange('footer.copyrightText', e.target.value)} />
                  </Field>
                  <label className="checkbox-row" style={{ marginBottom: 14 }}>
                    <input type="checkbox" checked={appearanceConfig?.footer?.showPoweredBy !== false} onChange={(e) => handleAppearanceChange('footer.showPoweredBy', e.target.checked)} />
                    Show "Powered by KG-MIS"
                  </label>
                </>
              )}
            </Card>

            <Button onClick={saveAppearance}><Icon name="floppy-disk" /> Save appearance</Button>

          </div>
        </div>
      ) : null}

      {tab === 'access' ? (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <Card title="Grant report access">
            <Field label="User" hint="Pick from the user directory, or enter a user id">
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="select" value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)}>
                  <option value="">— select user —</option>
                  {(adminUsers.data?.items ?? []).map((u) => <option key={u.UserID} value={String(u.UserID)}>{u.Name} ({u.Email ?? `#${u.UserID}`})</option>)}
                </select>
                {adminUsers.error ? (
                  <input className="input" style={{ width: 110 }} type="number" placeholder="user id" value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)} />
                ) : null}
              </div>
            </Field>
            <Field label="Access level">
              <select className="select" value={grantLevel} onChange={(e) => setGrantLevel(e.target.value as 'View' | 'Export')}>
                <option value="View">View reports</option>
                <option value="Export">View + export</option>
              </select>
            </Field>
            <Button onClick={grantAccess} disabled={!grantUserId}><Icon name="user-plus" /> Grant access</Button>
          </Card>
          <Card title="People with report access" flush>
            {reportAccess.loading ? <Loading /> : reportAccess.data?.items.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>User</th><th>Level</th><th>Since</th><th></th></tr></thead>
                  <tbody>
                    {reportAccess.data.items.map((r) => (
                      <tr key={r.AccessID}>
                        <td>{r.UserName} <span className="hint">({r.UserEmail ?? `#${r.UserID}`})</span></td>
                        <td><Badge tone={r.AccessLevel === 'Export' ? 'success' : 'info'}>{r.AccessLevel}</Badge></td>
                        <td>{fmtDateTime(r.CreatedAt)}</td>
                        <td><Button variant="danger-ghost" size="sm" onClick={() => void revokeAccess(r.UserID)}>Revoke</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty icon="user-shield" message="No extra access granted — owner and managers see reports by default" />
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'children' ? (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <Card title="Create child form">
            <p className="hint" style={{ marginBottom: 10 }}>
              Child forms are clones of this form, linked so schema changes can be propagated. Create one per region
              or initiative; customize it independently before publishing.
            </p>
            <Field label="Child title" required>
              <input className="input" value={childTitle} onChange={(e) => setChildTitle(e.target.value)} placeholder={`${form.Title} — {region}`} />
            </Field>
            <Button onClick={createChild} disabled={!childTitle.trim()}><Icon name="clone" /> Create child</Button>
            <div style={{ marginTop: 14 }}>
              <Button variant="ghost" onClick={propagate} disabled={!children.data?.items.length}>
                <Icon name="arrows-rotate" /> Push parent changes to all children
              </Button>
            </div>
          </Card>
          <Card title="Child forms" flush>
            {children.loading ? <Loading /> : children.data?.items.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>#</th><th>Title</th><th>Status</th><th>Responses</th></tr></thead>
                  <tbody>
                    {children.data.items.map((c) => (
                      <tr key={c.TemplateID}>
                        <td>#{c.TemplateID}</td>
                        <td><a href={`/forms/${c.TemplateID}`} style={{ fontWeight: 600 }}>{c.Title}</a></td>
                        <td><Badge tone={c.Status === 'Published' ? 'success' : c.Status === 'Draft' ? 'neutral' : 'warning'}>{c.Status}</Badge></td>
                        <td>{c.ResponseCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty icon="diagram-project" message="No child forms yet. Create one to start a region or initiative rollout." />
            )}
          </Card>
        </div>
      ) : null}

      <Modal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Upload image"
        footer={
          <>
            <Button variant="ghost" onClick={() => setUploadModalOpen(false)}>Cancel</Button>
          </>
        }
      >
        <p className="hint" style={{ marginBottom: 12 }}>
          {uploadTarget === 'header' ? 'Header / banner image' : uploadTarget === 'watermark' ? 'Watermark image' : 'Footer logo'}
          {' — '}(JPG, PNG, GIF, SVG · max 5&nbsp;MB)
        </p>
        <input
          key={uploadTarget ?? 'none'}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImageUpload(f);
          }}
          style={{ width: '100%' }}
        />
        {uploadProgress > 0 && uploadProgress < 100 ? (
          <div className="hint" style={{ marginTop: 10 }}>Uploading… {uploadProgress}%</div>
        ) : null}
        {uploadError ? (
          <div className="hint" style={{ marginTop: 10, color: 'var(--danger, #b91c1c)' }}>{uploadError}</div>
        ) : null}
      </Modal>
    </div>
  );
}