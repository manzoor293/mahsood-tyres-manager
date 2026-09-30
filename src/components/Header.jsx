import { useState } from 'react';
import { Alert, Button } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';

export default function Header() {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    if (busy) return;
    setBusy(true); setError('');
    try { await logout(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return (
    <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-5 lg:px-9">
      <Button sx={{ float: 'right', ml: 2 }} disabled={busy} onClick={signOut}>{busy ? 'Signing out...' : 'Logout'}</Button>
      <p className="text-lg font-semibold tracking-tight text-slate-900">Mahsood Tyre Manager</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">Sales, Inventory &amp; Shop Management System</p>
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    </header>
  );
}
