import { useEffect, useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { catalogRequest } from '../../utils/catalog.js';

export default function SaleSelector({ kind, value, onChange, label, name, disabled, active = true, autoFocus = false }) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true; setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await catalogRequest(() => window.api[kind].list({ search, active, limit: 100 }));
        if (live) { setOptions(rows); setError(''); }
      } catch (error) { if (live) setError(error.message); }
      finally { if (live) setLoading(false); }
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [kind, search, active]);
  return <Autocomplete value={value} onChange={(_, row) => onChange(row)} disabled={disabled} options={options} loading={loading}
    onInputChange={(_, text) => setSearch(text)} filterOptions={(rows) => rows} isOptionEqualToValue={(a,b) => a.id === b.id}
    getOptionLabel={(row) => kind === 'products' ? `${row.sku} · ${row.model} · ${row.size}` : `${row.name}${row.phone ? ` · ${row.phone}` : ''}${!row.active ? ' (inactive)' : ''}`}
    renderOption={(props, row) => { const { key, ...rest } = props; return <li key={row.id} {...rest}><div>{kind === 'products' ? `${row.sku} · ${row.model} · ${row.size}` : row.name}<div className="text-xs text-slate-500">{kind === 'products' ? `${row.stock_quantity} available` : row.phone || 'No phone'}</div></div></li>; }}
    renderInput={(params) => <TextField {...params} name={name} label={label} autoFocus={autoFocus} error={Boolean(error)} helperText={error || (kind === 'products' ? 'Search SKU, model, brand or size. Select again to add another unit.' : 'Search name, phone or address.')} />} />;
}
