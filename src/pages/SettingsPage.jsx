import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper } from '@mui/material';
import { catalogRequest } from '../utils/catalog.js';

export default function SettingsPage() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const pending = useRef(false);
  async function refresh() {
    setLoading(true); setError('');
    try {
      if (!window.api?.backup) throw new Error('Open the desktop application to manage backups.');
      setInfo(await catalogRequest(() => window.api.backup.getInfo()));
    } catch (error) { setError(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  async function run(method) {
    if (pending.current) return;
    pending.current = true; setBusy(method); setError(''); setNotice(null); setConfirm(false);
    try {
      const result = await catalogRequest(() => window.api.backup[method]());
      setNotice(result.canceled ? { severity: 'info', text: 'Operation cancelled.' }
        : { severity: 'success', text: method === 'create' ? `Backup created: ${result.name}` : 'Backup restored successfully. All modules now use the restored data. A safety backup of your previous data has been retained.' });
      await refresh();
    } catch (error) { setError(error.message); }
    finally { pending.current = false; setBusy(''); }
  }
  const disabled = loading || Boolean(busy) || !info;
  return <section className="mx-auto min-w-0 max-w-4xl" aria-labelledby="page-title">
    <h1 id="page-title" className="text-3xl font-semibold">Settings</h1>
    <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 3 }, overflowWrap: 'anywhere' }}>
      <h2 className="text-xl font-semibold">Data Backup &amp; Restore</h2>
      <p className="my-3 text-sm text-slate-600">Save a complete local copy of your shop data. Keep important backups on a separate drive.</p>
      {loading && <div role="status" className="flex items-center gap-3 py-4"><CircularProgress size={22}/>Loading database information...</div>}
      {error && <Alert severity="error" sx={{ my: 2 }} action={<Button disabled={Boolean(busy)} onClick={refresh}>Retry</Button>}>{error}</Alert>}
      {notice && <Alert severity={notice.severity} sx={{ my: 2 }}>{notice.text}</Alert>}
      {info && <div className="space-y-3 py-3">
        <p>Database Status: <strong>{info.status}</strong></p>
        <p>Schema Version: <strong>{info.schemaVersion}</strong></p>
        <p className="text-sm">Database location: <span className="text-slate-600">{info.location}</span></p>
        <p className="text-sm">Last manual backup this session: {info.lastBackup ? `${info.lastBackup.name} — ${new Date(info.lastBackup.createdAt).toLocaleString()}` : 'No backup created this session.'}</p>
      </div>}
      {busy && <div role="status" className="flex items-center gap-3 py-4"><CircularProgress size={22}/>{busy === 'create' ? 'Creating backup...' : 'Restoring backup...'} Please keep the application open.</div>}
      <div className="my-4 flex flex-wrap gap-3">
        <Button variant="contained" disabled={disabled} onClick={() => run('create')}>Create Backup</Button>
        <Button variant="outlined" color="warning" disabled={disabled} onClick={() => { setUnderstood(false); setConfirm(true); }}>Restore Backup</Button>
        <Button disabled={loading || Boolean(busy)} onClick={refresh}>Refresh Status</Button>
      </div>
      <h3 className="mt-6 font-semibold">Recovery backups</h3>
      <p className="my-2 text-sm text-slate-600">Created automatically before restores and retained in the recovery folder beside the database folder.</p>
      {info && (info.recoveryBackups.length ? <ul className="space-y-3 text-sm">{info.recoveryBackups.map(file => <li key={file.name}><span className="block">{file.name}</span><span className="text-slate-500">{new Date(file.createdAt).toLocaleString()} · {Math.ceil(file.size / 1024)} KB</span></li>)}</ul> : <p className="text-sm">No recovery backups yet.</p>)}
    </Paper>
    <Dialog open={confirm} onClose={() => setConfirm(false)} fullWidth maxWidth="sm" aria-labelledby="restore-title">
      <DialogTitle id="restore-title">Restore shop data?</DialogTitle>
      <DialogContent>
        <Alert severity="warning">Restoring a backup will replace the current shop data. A safety backup of the current database will be created first.</Alert>
        <FormControlLabel sx={{ mt: 2 }} control={<Checkbox checked={understood} onChange={event => setUnderstood(event.target.checked)}/>} label="I understand that current shop data will be replaced."/>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}><Button onClick={() => setConfirm(false)}>Cancel</Button><Button color="warning" variant="contained" disabled={!understood || Boolean(busy)} onClick={() => run('restore')}>Continue to Restore</Button></DialogActions>
    </Dialog>
  </section>;
}
