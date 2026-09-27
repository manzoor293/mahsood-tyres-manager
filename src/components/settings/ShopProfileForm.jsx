import { useEffect, useRef, useState } from 'react';
import { Alert, Button, CircularProgress, Paper, TextField } from '@mui/material';
import { catalogRequest } from '../../utils/catalog.js';

const fields = [
  ['name', 'Shop Name', 200], ['address', 'Address', 1000], ['phone', 'Phone', 40],
  ['alternatePhone', 'Alternate Phone', 40], ['email', 'Email', 254], ['ntn', 'Registration / Tax Number', 100],
];
export default function ShopProfileForm({ maintenanceBusy, onSavingChange }) {
  const [profile, setProfile] = useState(null);
  const [saved, setSaved] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const pending = useRef(false);
  const dirty = Boolean(profile && JSON.stringify(profile) !== JSON.stringify(saved));
  async function load() {
    setLoading(true); setError('');
    try {
      if (!window.api?.settings) throw new Error('Open the desktop application to manage shop settings.');
      const [data, prefs] = await Promise.all([
        catalogRequest(() => window.api.settings.getShopProfile()),
        catalogRequest(() => window.api.settings.getPreferences()),
      ]);
      setProfile(data); setSaved(data); setPreferences(prefs);
    } catch (error) { setError(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function save(event) {
    event.preventDefault();
    if (pending.current || maintenanceBusy || !dirty) return;
    pending.current = true; setSaving(true); onSavingChange(true); setError(''); setSuccess(false);
    try {
      const data = await catalogRequest(() => window.api.settings.updateShopProfile(profile));
      setProfile(data); setSaved(data); setSuccess(true);
    } catch (error) { setError(error.message); }
    finally { pending.current = false; setSaving(false); onSavingChange(false); }
  }
  const disabled = saving || maintenanceBusy;
  function change(field, value) { setProfile(current => ({ ...current, [field]: value })); setSuccess(false); }
  return <Paper component="form" noValidate onSubmit={save} variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 3 } }} aria-label="Shop settings">
    <h2 className="text-xl font-semibold">Shop Profile</h2>
    <p className="my-3 text-sm text-slate-600">Used on future previews, prints and PDFs, including documents for earlier transactions.</p>
    {loading ? <div role="status" className="flex items-center gap-3 py-4"><CircularProgress size={22}/>Loading shop profile...</div> : <>
      {error && <Alert severity="error" sx={{ my: 2 }} action={!profile && <Button disabled={disabled} onClick={load}>Retry Profile</Button>}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ my: 2 }}>Shop settings saved.</Alert>}
      {profile && <>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {fields.map(([field, label, limit]) => <TextField key={field} fullWidth name={`shop-${field}`} label={label} required={field === 'name'} value={profile[field]} disabled={disabled} multiline={field === 'address'} minRows={field === 'address' ? 2 : undefined} onChange={event => change(field, event.target.value)} slotProps={{ htmlInput: { maxLength: limit } }}/>) }
        </div>
        <h2 className="mb-3 mt-6 text-xl font-semibold">Invoice &amp; Receipt</h2>
        <TextField fullWidth multiline minRows={3} name="shop-footer" label="Receipt Footer" value={profile.footer} disabled={disabled} onChange={event => change('footer', event.target.value)} helperText="Optional plain text. No HTML. Maximum 1,000 characters." slotProps={{ htmlInput: { maxLength: 1000 } }}/>
        <h2 className="mb-3 mt-6 text-xl font-semibold">Application Preferences</h2>
        <p>Currency: {preferences?.currencyLabel}</p>
        <p className="my-2 text-sm text-slate-600">PKR is the supported currency. Payment methods are selected when recording each transaction.</p>
        {dirty && <Alert severity="warning" sx={{ my: 2 }}>You have unsaved changes. Save before leaving this page or creating a backup. Restoring a backup replaces these changes.</Alert>}
        {saving && <p role="status" className="my-3">Saving shop settings...</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="submit" variant="contained" disabled={disabled || !dirty}>Save Changes</Button>
          <Button disabled={disabled || !dirty} onClick={() => { setProfile(saved); setError(''); setSuccess(false); }}>Discard Changes</Button>
        </div>
      </>}
    </>}
  </Paper>;
}
