import { useEffect, useState } from 'react';
import { catalogApi, catalogRequest } from '../utils/catalog.js';

export const pageSize = 25;

async function allOptions(resource) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await catalogRequest(() => resource.list({ active: 'all', limit: 500, offset }));
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}

export default function useProductCatalog(filters, page) {
  const [revision, setRevision] = useState(0);
  const [options, setOptions] = useState({ brands: [], categories: [], loading: true, error: '' });
  const [result, setResult] = useState({ rows: [], loading: true, error: '', hasNext: false });
  useEffect(() => {
    let cancelled = false;
    setOptions((previous) => ({ ...previous, loading: true, error: '' }));
    (async () => {
      const api = catalogApi();
      const [brands, categories] = await Promise.all([allOptions(api.brands), allOptions(api.categories)]);
      if (!cancelled) setOptions({ brands, categories, loading: false, error: '' });
    })().catch((error) => { if (!cancelled) setOptions({ brands: [], categories: [], loading: false, error: error.message }); });
    return () => { cancelled = true; };
  }, [revision]);

  useEffect(() => {
    let cancelled = false;
    setResult({ rows: [], loading: true, error: '', hasNext: false });
    const timer = setTimeout(async () => {
      try {
        const api = catalogApi();
        const rows = await catalogRequest(() => api.products.list({
          search: filters.search, active: filters.active === 'all' ? 'all' : filters.active === 'active',
          ...(filters.brand ? { brand_id: Number(filters.brand) } : {}),
          ...(filters.category ? { category_id: Number(filters.category) } : {}),
          limit: pageSize + 1, offset: page * pageSize,
        }));
        if (!cancelled) setResult({ rows: rows.slice(0, pageSize), hasNext: rows.length > pageSize, loading: false, error: '' });
      } catch (error) {
        if (!cancelled) setResult({ rows: [], hasNext: false, loading: false, error: error.message });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [filters.search, filters.active, filters.brand, filters.category, page, revision]);

  return { ...result, options, refresh: () => setRevision((value) => value + 1) };
}
