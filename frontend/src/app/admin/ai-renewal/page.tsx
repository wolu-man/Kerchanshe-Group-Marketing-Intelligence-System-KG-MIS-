'use client';

import { useEffect, useState } from 'react';
import { Guard, RequireRole } from '@/components/Guard';
import { Button, Card, Loading, Badge, Field, Tabs, Icon, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/Toast';
import type { AiProviderStatus } from '@/lib/ai-types';

interface ProviderStatusCardProps {
  provider: AiProviderStatus;
  onTest: () => void;
  onSave: () => void;
  onCancel: () => void;
  isTesting: boolean;
  isSaving: boolean;
  showKey: boolean;
  keyValue: string;
  setKeyValue: (v: string) => void;
  toggleShowKey: () => void;
  keyUrl: string;
}

function ProviderStatusCard({
  provider,
  onTest,
  onSave,
  onCancel,
  isTesting,
  isSaving,
  showKey,
  keyValue,
  setKeyValue,
  toggleShowKey,
  keyUrl,
}: ProviderStatusCardProps) {
  const statusColor = provider.available
    ? 'success'
    : provider.configured
    ? 'warning'
    : 'danger';
  const statusText = provider.available
    ? 'Available'
    : provider.configured
    ? 'Configured — Unavailable'
    : 'Not Configured';

  return (
    <Card title={provider.label} className="provider-card">
      <div style={{ display: 'grid', gap: 16 }}>
        {/* Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Badge tone={statusColor}>{statusText}</Badge>
          {provider.model && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Model: <code>{provider.model}</code></span>
          )}
        </div>

        {provider.detail && (
          <div className="hint" style={{ fontSize: 13 }}>{provider.detail}</div>
        )}

        {/* API Key Input */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <Field label="API Key" required>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                type={showKey ? 'text' : 'password'}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder="Enter new API key..."
                style={{ flex: 1 }}
                autoComplete="off"
              />
              <Button variant="ghost" size="sm" onClick={toggleShowKey} title={showKey ? 'Hide key' : 'Show key'}>
                <Icon name={showKey ? 'eye-slash' : 'eye'} />
              </Button>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              Get your API key from{' '}
              <a href={keyUrl} target="_blank" rel="noopener noreferrer">
                {provider.id === 'gemini' ? 'Google AI Studio' : 'Groq Console'}
              </a>
              {' '}(opens in new tab)
            </div>
          </Field>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <Button
            variant="ghost"
            onClick={onTest}
            busy={isTesting}
            disabled={!keyValue.trim() || isSaving}
          >
            <Icon name="plug-circle-check" className="mr-1" /> Test Connection
          </Button>
          <Button
            onClick={onSave}
            busy={isSaving}
            disabled={!keyValue.trim() || isTesting}
          >
            <Icon name="key" className="mr-1" /> Save / Renew
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={isTesting || isSaving}>
            <Icon name="xmark" className="mr-1" /> Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AiRenewalInner() {
  const [providers, setProviders] = useState<AiProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [testingProvider, setTestingProvider] = useState<'gemini' | 'groq' | null>(null);
  const [savingProvider, setSavingProvider] = useState<'gemini' | 'groq' | null>(null);
  const [tab, setTab] = useState<'providers' | 'rotation'>('providers');
  const [rotation, setRotation] = useState<{
    enabled: boolean;
    intervalDays: number | null;
    nextRun: string | null;
    provider: string | null;
    due: boolean;
  }>({
    enabled: false,
    intervalDays: 90,
    nextRun: null,
    provider: null,
    due: false,
  });
  const [rotationSaving, setRotationSaving] = useState(false);

  // Load provider statuses on mount
  useEffect(() => {
    loadProviders();
    loadRotation();
  }, []);

  async function loadProviders() {
    try {
      const res = await api<{ providers: AiProviderStatus[] }>('/ai/renewal/providers/status');
      setProviders(res.providers);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load provider status');
    } finally {
      setLoading(false);
    }
  }

  async function loadRotation() {
    try {
      const res = await api<{
        enabled: boolean;
        intervalDays: number | null;
        nextRun: string | null;
        provider: string | null;
        due: boolean;
      }>('/ai/renewal/rotation');
      setRotation(res);
    } catch (err) {
      console.error('Failed to load rotation config:', err);
      toast.error(err instanceof ApiError ? err.message : 'Failed to load rotation settings');
    }
  }

  async function testConnection(provider: 'gemini' | 'groq') {
    const key = provider === 'gemini' ? geminiKey : groqKey;
    if (!key.trim()) {
      toast.error('Please enter an API key first');
      return;
    }

    setTestingProvider(provider);
    try {
      const res = await api<{
        valid: boolean;
        error?: string;
        errorCode?: string;
        model?: string;
        detail?: string;
      }>('/ai/renewal/validate', {
        method: 'POST',
        body: { provider, apiKey: key },
      });

      if (res.valid) {
        toast.success(`${provider === 'gemini' ? 'Gemini' : 'Groq'} connection successful`);
        await loadProviders();
      } else {
        toast.error(res.error || 'Connection failed');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Validation failed');
    } finally {
      setTestingProvider(null);
    }
  }

  async function saveKey(provider: 'gemini' | 'groq') {
    const key = provider === 'gemini' ? geminiKey : groqKey;
    if (!key.trim()) {
      toast.error('Please enter an API key first');
      return;
    }

    setSavingProvider(provider);
    try {
      const res = await api<{
        success: boolean;
        provider: string;
        model?: string;
        status?: string;
        message?: string;
      }>('/ai/renewal/apply', {
        method: 'POST',
        body: { provider, apiKey: key },
      });

      if (res.success) {
        toast.success(res.message || `${provider === 'gemini' ? 'Gemini' : 'Groq'} API key updated`);
        // Clear the input after successful save
        if (provider === 'gemini') setGeminiKey('');
        else setGroqKey('');
        await loadProviders();
      } else {
        toast.error('Failed to save key');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save key');
    } finally {
      setSavingProvider(null);
    }
  }

  async function saveRotation() {
    setRotationSaving(true);
    try {
      const intervalDays = rotation.intervalDays ?? 90;
      const nextRun = rotation.enabled
        ? new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString()
        : '';

      await api('/ai/renewal/rotation', {
        method: 'PUT',
        body: {
          enabled: rotation.enabled,
          intervalDays,
          provider: rotation.provider || undefined,
          nextRun: nextRun || undefined,
        },
      });

      toast.success('Rotation settings saved');
      await loadRotation();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save rotation settings');
    } finally {
      setRotationSaving(false);
    }
  }

  const geminiProvider = providers.find(p => p.id === 'gemini');
  const groqProvider = providers.find(p => p.id === 'groq');

  if (loading) return <Loading label="Loading provider status…" />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>AI Renewal</h1>
          <div className="sub">
            Manage Gemini and Groq API keys. Test connections, renew exhausted keys, and configure scheduled rotation reminders.
          </div>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'providers', label: 'Providers' },
          { id: 'rotation', label: 'Rotation' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as 'providers' | 'rotation')}
      />

      {tab === 'providers' && (
      <div style={{ marginTop: 24, display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
        {geminiProvider && (
          <ProviderStatusCard
            provider={geminiProvider}
            onTest={() => testConnection('gemini')}
            onSave={() => saveKey('gemini')}
            onCancel={() => setGeminiKey('')}
            isTesting={testingProvider === 'gemini'}
            isSaving={savingProvider === 'gemini'}
            showKey={showGeminiKey}
            keyValue={geminiKey}
            setKeyValue={setGeminiKey}
            toggleShowKey={() => setShowGeminiKey(v => !v)}
            keyUrl="https://aistudio.google.com/apikey"
          />
        )}
        {groqProvider && (
          <ProviderStatusCard
            provider={groqProvider}
            onTest={() => testConnection('groq')}
            onSave={() => saveKey('groq')}
            onCancel={() => setGroqKey('')}
            isTesting={testingProvider === 'groq'}
            isSaving={savingProvider === 'groq'}
            showKey={showGroqKey}
            keyValue={groqKey}
            setKeyValue={setGroqKey}
            toggleShowKey={() => setShowGroqKey(v => !v)}
            keyUrl="https://console.groq.com/keys"
          />
        )}
      </div>
      )}

      {/* Rotation Settings */}
      {tab === 'rotation' && (
      <Card title="Scheduled Key Rotation" style={{ marginTop: 24 }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label="Enable Rotation Reminders" required>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={rotation.enabled}
                onChange={(e) => setRotation({ ...rotation, enabled: e.target.checked })}
              />
              <span>Mark keys as due for rotation after the configured interval. Does not auto-generate keys — admin must provide replacement keys.</span>
            </label>
          </Field>

          {rotation.enabled && (
            <>
              <Field label="Rotation Interval (days)" required>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={rotation.intervalDays ?? ''}
                  onChange={(e) => setRotation({ ...rotation, intervalDays: e.target.value === '' ? null : parseInt(e.target.value, 10) || 90 })}
                />
                <div className="hint">How often keys should be rotated. Default: 90 days.</div>
              </Field>

              <Field label="Next Rotation Due" required>
                <Input
                  type="datetime-local"
                  value={rotation.nextRun ? rotation.nextRun.slice(0, 16) : ''}
                  onChange={(e) => setRotation({ ...rotation, nextRun: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  disabled
                />
                <div className="hint">
                  {rotation.due
                    ? <Badge tone="danger">Rotation due — provide new key</Badge>
                    : rotation.nextRun
                    ? `Scheduled for ${new Date(rotation.nextRun).toLocaleString()}`
                    : 'Will be calculated when interval is set'}
                </div>
              </Field>

              <Field label="Provider to Rotate" required>
                <select
                  className="select"
                  value={rotation.provider ?? ''}
                  onChange={(e) => setRotation({ ...rotation, provider: e.target.value || null })}
                >
                  <option value="">-- Select provider --</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="groq">Groq</option>
                </select>
                <div className="hint">Which provider's key rotation to track.</div>
              </Field>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <Button onClick={saveRotation} busy={rotationSaving}>
              <Icon name="floppy-disk" className="mr-1" /> Save Rotation Settings
            </Button>
          </div>
        </div>
      </Card>
      )}
    </div>
  );
}

export default function AiRenewalPage() {
  return (
    <Guard>
      <RequireRole roles={['Administrator']}>
        <AiRenewalInner />
      </RequireRole>
    </Guard>
  );
}