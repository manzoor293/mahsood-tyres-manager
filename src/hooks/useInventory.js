import { useEffect, useState } from 'react';
import { catalogRequest } from '../utils/catalog.js';

export const inventoryDefaults = { search: '', brand: 'all', category: 'all', active: 'all', stock: 'all', type: 'all', from: '', to: '' };
export default function useInventory(tab, filters, productId, page) {
  const [state, setState] = useState({ rows: [], brands: [], categories: [], loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const timer = setTimeout(async () => {
      try {
        if (!window.api?.inventory) throw new Error('Open the desktop application to manage inventory.');
        const query = { search: filters.search, active: filters.active === 'all' ? 'all' : filters.active === 'active', limit: 51, offset: page * 50 };
        if (filters.brand !== 'all') query.brand_id = Number(filters.brand);
        if (filters.category !== 'all') query.category_id = Number(filters.category);
        if (tab === 'stock') query.stock_status = filters.stock;
        else {
          query.movement_type = filters.type;
          if (productId) query.product_id = productId;
          if (filters.from) query.from_date = filters.from;
          if (filters.to) query.to_date = filters.to;
        }
        async function lookups(api) {
          const rows = [];
          for (let offset = 0; ; offset += 500) {
            const batch = await catalogRequest(() => api.list({ active: 'all', limit: 500, offset }));
            rows.push(...batch); if (batch.length < 500) return rows;
          }
        }
        const [rows, brands, categories] = await Promise.all([
          catalogRequest(() => window.api.inventory[tab === 'stock' ? 'list' : 'listMovements'](query)),
          lookups(window.api.brands), lookups(window.api.categories),
        ]);
        if (live) setState({ rows, brands, categories, loading: false, error: '' });
      } catch (error) { if (live) setState((s) => ({ ...s, loading: false, error: error.message })); }
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [tab, filters, productId, page, revision]);
  return { ...state, refresh: () => setRevision((r) => r + 1) };
}
