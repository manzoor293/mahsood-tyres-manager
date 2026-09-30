import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Button, CircularProgress } from '@mui/material';
import AuthPage from '../pages/AuthPage.jsx';
import { catalogRequest } from '../utils/catalog.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthBoundary({ children }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const timer = useRef(null);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    clearTimeout(timer.current);
    try {
      if (!window.api?.auth) throw new Error('Open Mahsood Tyre Manager in the desktop application.');
      const next = await catalogRequest(() => window.api.auth.getStatus());
      if (request === revision.current) { setStatus(next); setError(''); }
    } catch (failure) {
      if (request !== revision.current) return;
      if (failure.code === 'MAINTENANCE') { timer.current = setTimeout(refresh, 200); return; }
      setStatus(null); setError(failure.message);
    }
  }, []);
  useEffect(() => {
    refresh();
    const unsubscribe = window.api?.auth?.onChanged(() => {
      setStatus(null); // Discard mounted business views when session/database changes.
      refresh();
    });
    return () => { unsubscribe?.(); clearTimeout(timer.current); revision.current++; };
  }, [refresh]);
  const logout = async () => {
    await catalogRequest(() => window.api.auth.logout());
    await refresh();
  };
  if (error) return <div className="flex min-h-screen items-center justify-center p-6"><Alert severity="error" action={<Button onClick={refresh}>Retry</Button>}>{error}</Alert></div>;
  if (!status) return <div role="status" className="flex min-h-screen items-center justify-center gap-3"><CircularProgress size={24} />Loading account...</div>;
  if (!status.authenticated) return <AuthPage setup={!status.hasAdministrator} onAuthenticated={refresh} />;
  return <AuthContext.Provider value={{ logout }}>{children}</AuthContext.Provider>;
}
