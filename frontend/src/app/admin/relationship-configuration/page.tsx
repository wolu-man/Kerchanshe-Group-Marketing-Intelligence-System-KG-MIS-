'use client';

import { useState, useEffect } from 'react';
import { useFetch } from '@/lib/use-api';
import { useAuth } from '@/lib/auth-context';
import { toast } from '@/components/Toast';
import { ApiError } from '@/lib/api';
import { TourTrigger } from '@/components/tour/TourTrigger';

/** Shape of a relationship configuration. */
export interface RelationshipConfiguration {
  ConfigurationID: number;
  ParentEntity: string;
  ChildEntity: string;
  RelationshipType: string;
  IsActive: boolean;
  Required: boolean;
  DisplayOrder: number;
}

/** Admin page component for Relationship Configuration */
export default function RelationshipConfigurationAdmin() {
  const { user } = useAuth();

  const { data: configs, error: configError, loading: configLoading } = useFetch<{
    items: RelationshipConfiguration[];
  }>('/configurations/relationship-configurations');

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<{
    ParentEntity: string;
    ChildEntity: string;
    RelationshipType: string;
    IsActive: boolean;
    Required: boolean;
    DisplayOrder: number;
  }>({
    ParentEntity: '',
    ChildEntity: '',
    RelationshipType: 'One-to-Many',
    IsActive: true,
    Required: true,
    DisplayOrder: 0,
  });
  const [formId, setFormId] = useState(0);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = mode === 'create'
      ? '/configurations/relationships'
      : `/configurations/relationships/${formId}`;
    const method = mode === 'create' ? 'POST' : 'PUT';
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}${url}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('kgmis_token')}`,
        },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(res.status, body.error ?? 'ERROR', body.message ?? 'Save failed');
      }
      toast.success(mode === 'create' ? 'Relationship added' : 'Relationship updated');
      setOpen(false);
      setMode('create');
      setFormData({
        ParentEntity: '',
        ChildEntity: '',
        RelationshipType: 'One-to-Many',
        IsActive: true,
        Required: true,
        DisplayOrder: 0,
      });
      setFormId((prev) => prev + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save relationship');
    }
  };

  // Edit this relationship - open form with preloaded values
  const handleEdit = (c: RelationshipConfiguration) => {
    setMode('edit');
    setFormId(c.ConfigurationID);
    setFormData({
      ParentEntity: c.ParentEntity,
      ChildEntity: c.ChildEntity,
      RelationshipType: c.RelationshipType,
      IsActive: c.IsActive,
      Required: c.Required,
      DisplayOrder: c.DisplayOrder,
    });
    setOpen(true);
  };

  // Delete this relationship (with confirmation)
  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this relationship configuration?')) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/configurations/relationships/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('kgmis_token')}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(res.status, body.error ?? 'ERROR', body.message ?? 'Delete failed');
      }
      toast.success('Relationship deleted');
      setFormId((prev) => prev + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
    }
  };

  if (configLoading) {
    return (
      <div>
        <p>Loading relationships configuration...</p>
      </div>
    );
  }

  if (configError) {
    toast.error(configError);
    return null;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Relationship Configuration</h1>
        <TourTrigger tourId="admin-relationships" />
      </div>

      <p style={{ marginBottom: 16, color: 'var(--text-muted)' }}>
        Configure parent→child relationships between master data entities.
        These configurations will be used by frontend forms to automatically
        filter dependent dropdowns.
      </p>

      {!open ? (
        <button
          type="button"
          style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}
          onClick={() => { setMode('create'); setOpen(true); }}
        >
          New relationship
        </button>
      ) : null}

      {configs && configs.items.length ? (
        <div data-tour="rel-list" style={{ marginBottom: 24, border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <h3>Existing Relationships</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: 8, textAlign: 'left' }}>Parent Entity</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Child Entity</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Type</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Required</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Status</th>
                <th style={{ padding: 8, textAlign: 'left' }}>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {configs.items.map((c) => (
                <tr key={c.ConfigurationID} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>{c.ParentEntity}</td>
                  <td style={{ padding: 8 }}>{c.ChildEntity}</td>
                  <td style={{ padding: 8 }}>{c.RelationshipType}</td>
                  <td style={{ padding: 8 }}>
                    <span style={{ color: 'var(--primary)' }}>{c.Required ? 'Yes' : 'No'}</span>
                  </td>
                  <td style={{ padding: 8 }}>
                    <span style={{ color: c.IsActive ? 'var(--success)' : 'var(--danger)' }}>
                      {c.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: 8 }}>
                    <button style={{ marginRight: 4, cursor: 'pointer' }} onClick={() => handleEdit(c)}>
                      Edit
                    </button>
                    <button style={{ marginLeft: 4, cursor: 'pointer' }} onClick={() => handleDelete(c.ConfigurationID)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div data-tour="rel-list" style={{ marginBottom: 24 }}>
          <p>No relationships configured yet.</p>
          <p>Use the form below to add a new relationship.</p>
        </div>
      )}

      {/* Add/Edit Relationship Form (inline, not modal) */}
      {open && (
        <div data-tour="rel-form" style={{ marginTop: 24, background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>
            {mode === 'create' ? 'Add Relationship' : 'Edit Relationship'}
          </h3>

          <form onSubmit={e => {
            e.preventDefault();
            handleSubmit(e);
          }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Parent Entity
              </label>
              <select
                style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 4, fontSize: 14 }}
                onChange={(e) => setFormData({ ...formData, ParentEntity: e.target.value })}
              >
                <option value="">— select —</option>
                <option value="BusinessGroup">Business Group</option>
                <option value="Region">Region</option>
                <option value="Outlet">Outlet</option>
                <option value="Product">Product</option>
                <option value="Customer">Customer</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Child Entity
              </label>
              <select
                style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 4, fontSize: 14 }}
                onChange={(e) => setFormData({ ...formData, ChildEntity: e.target.value })}
              >
                <option value="">— select —</option>
                <option value="Region">Region</option>
                <option value="Outlet">Outlet</option>
                <option value="Product">Product</option>
                <option value="Customer">Customer</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Relationship Type
              </label>
              <select
                style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 4, fontSize: 14 }}
                onChange={(e) => setFormData({ ...formData, RelationshipType: e.target.value })}
              >
                <option value="One-to-Many">One-to-Many</option>
                <option value="One-to-One">One-to-One</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Required
              </label>
              <select
                style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 4, fontSize: 14 }}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    Required: e.target.value === 'true',
                  })
                }
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Display Order
              </label>
              <input
                type="number"
                style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 4, fontSize: 14 }}
                value={formData.DisplayOrder}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    DisplayOrder: Number(e.target.value),
                  })
                }
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
              <button type="button" style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                {mode === 'create' ? 'Save' : 'Update'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}