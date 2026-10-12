'use client';

import { useState, useRef } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Field, Badge, Icon } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { useAuth } from '@/lib/auth-context';
import { toast } from '@/components/Toast';
import { ApiError } from '@/lib/api';
import { ImageCropper } from '@/components/ImageCropper';

function ProfileInner() {
  const { user, updateProfile, changePassword, uploadPhoto } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [cropOpen, setCropOpen] = useState(false);
  const [cropImage, setCropImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10 MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropImage(ev.target?.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleCropSave(blob: Blob) {
    setUploading(true);
    try {
      const file = new File([blob], 'profile.jpg', { type: 'image/jpeg' });
      await uploadPhoto(file);
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSavingProfile(true);
    try {
      await updateProfile({ name: name.trim(), email: email.trim() || undefined });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    if (!currentPassword) { toast.error('Current password is required'); return; }
    if (newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setSavingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Password change failed');
    } finally {
      setSavingPassword(false);
    }
  }

  const photoUrl = user?.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:4000'}${user.profilePhoto}`)
    : null;

  const initials = user?.name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() ?? '?';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Profile</h1>
            <div className="sub">Manage your account settings</div>
          </div>
          <div className="actions">
            <TourTrigger tourId="profile" />
          </div>
        </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <div>
          <Card title="Profile Photo">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div
                style={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', position: 'relative', border: '3px solid var(--primary)' }}
                onClick={() => fileRef.current?.click()}
                title="Click to change photo"
              >
                {photoUrl ? (
                  <img src={photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary)', color: '#fff', fontSize: 28, fontWeight: 700 }}>
                    {initials}
                  </div>
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                >
                  <span style={{ color: '#fff', fontSize: 20 }}><Icon name="image" /></span>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFileSelect} style={{ display: 'none' }} />
              <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} busy={uploading}>
                <Icon name="image" /> {uploading ? 'Uploading...' : 'Change photo'}
              </Button>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                Click the photo or button to upload. JPG, PNG or WebP. Max 10 MB.
              </p>
            </div>
          </Card>

          <Card title="Personal Information" style={{ marginTop: 20 }}>
            <Field label="Full name" required>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </Field>
            <Field label="Role">
              <Badge tone="info">{user?.role}</Badge>
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button onClick={() => void saveProfile()} busy={savingProfile}>Save changes</Button>
            </div>
          </Card>
        </div>

        <div>
          <Card title="Change Password">
            <Field label="Current password" required>
              <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
            </Field>
            <Field label="New password" required>
              <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
            </Field>
            <Field label="Confirm new password" required>
              <input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" />
            </Field>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p style={{ fontSize: 13, color: 'var(--color-danger, #dc2626)', margin: '4px 0 0' }}>Passwords do not match</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button onClick={() => void savePassword()} busy={savingPassword}>Update password</Button>
            </div>
          </Card>
        </div>
      </div>

      {cropOpen && (
        <ImageCropper
          open={cropOpen}
          imageSrc={cropImage}
          onCrop={(blob) => void handleCropSave(blob)}
          onClose={() => setCropOpen(false)}
        />
      )}
    </>
  );
}

export default function ProfilePage() {
  return (
    <Guard>
      <ProfileInner />
    </Guard>
  );
}
