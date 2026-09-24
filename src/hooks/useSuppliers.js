import { useEffect, useState } from 'react';
import { catalogRequest } from '../utils/catalog.js';

export const supplierPageSize = 25;
export default function useSuppliers(search, status, page) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({ rows: [], loading: true, error: '', hasNext: false });
  useEffect(() => {
    let cancelled = false;
    setResult({ rows: [], loading: true, error: '', hasNext: false });
    const timer = setTimeout(async () => {
      try {
        if (!window.api?.suppliers) throw new Error('Open Mahsood Tyre Manager in the desktop application to manage suppliers.');
        const rows = await catalogRequest(() => window.api.suppliers.list({ search, active: status === 'all' ? 'all' : status === 'active', limit: supplierPageSize + 1, offset: page * supplierPageSize }));
        if (!cancelled) setResult({ rows: rows.slice(0, supplierPageSize), loading: false, error: '', hasNext: rows.length > supplierPageSize });
      } catch (error) { if (!cancelled) setResult({ rows: [], loading: false, error: error.message, hasNext: false }); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, status, page, revision]);
  return { ...result, refresh: () => setRevision((value) => value + 1) };
}
