import { useEffect, useState } from 'react';
import { catalogRequest } from '../utils/catalog.js';

export const customerPageSize = 25;
export default function useCustomers(search, status, page) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({ rows: [], loading: true, error: '', hasNext: false });
  useEffect(() => {
    let cancelled = false;
    setResult({ rows: [], loading: true, error: '', hasNext: false });
    const timer = setTimeout(async () => {
      try {
        if (!window.api?.customers) throw new Error('Open Mahsood Tyre Manager in the desktop application to manage customers.');
        const rows = await catalogRequest(() => window.api.customers.list({ search, active: status === 'all' ? 'all' : status === 'active', limit: customerPageSize + 1, offset: page * customerPageSize }));
        if (!cancelled) setResult({ rows: rows.slice(0, customerPageSize), loading: false, error: '', hasNext: rows.length > customerPageSize });
      } catch (error) { if (!cancelled) setResult({ rows: [], loading: false, error: error.message, hasNext: false }); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, status, page, revision]);
  return { ...result, refresh: () => setRevision((value) => value + 1) };
}
