import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { catalogApi, catalogRequest, parsePrice, priceInput } from '../../utils/catalog.js';

const labels = { sku: 'SKU', model: 'Model', size: 'Size', pattern: 'Pattern', tyre_type: 'Tyre Type', notes: 'Notes' };

export default function ProductDialog({ product, brands, categories, onClose, onSaved }) {
  const [values, setValues] = useState(() => ({
    sku: product?.sku || '', brand_id: product?.brand_id ?? '', category_id: product?.category_id ?? '',
    model: product?.model || '', size: product?.size || '', pattern: product?.pattern || '', tyre_type: product?.tyre_type || '',
    price: product ? priceInput(product.default_selling_price) : '', minimum_stock: String(product?.minimum_stock ?? 0), notes: product?.notes || '',
  }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const missingOptions = !brands.some((row) => row.active) || !categories.some((row) => row.active);
  const change = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setError('');
  };
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const nextErrors = {};
    for (const field of ['sku', 'model', 'size']) if (!values[field].trim()) nextErrors[field] = `${labels[field]} is required.`;
    for (const field of ['brand_id', 'category_id']) {
      if (!values[field] && !(product && product[field] === null)) nextErrors[field] = `Select a ${field === 'brand_id' ? 'brand' : 'category'}.`;
    }
    const price = parsePrice(values.price);
    if (price === null) nextErrors.price = 'Enter a nonnegative rupee amount with up to 2 decimal places.';
    const minimum = Number(values.minimum_stock);
    if (!/^\d+$/.test(values.minimum_stock) || !Number.isSafeInteger(minimum)) nextErrors.minimum_stock = 'Enter a nonnegative whole number.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    setError('');
    try {
      const data = { sku: values.sku, model: values.model, size: values.size, pattern: values.pattern, tyre_type: values.tyre_type,
        notes: values.notes, default_selling_price: price, minimum_stock: minimum };
      for (const field of ['brand_id', 'category_id']) if (values[field] !== '') data[field] = Number(values[field]);
      const api = catalogApi();
      await catalogRequest(() => product ? api.products.update(product.id, data) : api.products.create(data));
      onSaved(product ? 'Product updated.' : 'Product added.');
    } catch (failure) {
      setError(failure.message);
      if (failure.code === 'CONFLICT') setErrors({ sku: 'This SKU is already in use, including by inactive products.' });
    } finally { setSaving(false); }
  }
  return (
    <Dialog open onClose={() => { if (!saving) onClose(); }} fullWidth maxWidth="md" aria-labelledby="product-dialog-title">
      <form onSubmit={submit} noValidate>
        <DialogTitle id="product-dialog-title">{product ? 'Edit Product' : 'Add Product'}</DialogTitle>
        <DialogContent dividers>
          <p className="mb-5 text-sm text-slate-500">Product details and pricing. Stock is managed separately.</p>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {missingOptions && <Alert severity="info" sx={{ mb: 2 }}>An active brand and category are needed for a new product. {product ? 'Existing selections can be retained.' : 'No brand or category creation is available on this page.'}</Alert>}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="SKU" name="sku" required autoFocus value={values.sku} onChange={change('sku')} disabled={saving} error={Boolean(errors.sku)} helperText={errors.sku} slotProps={{ htmlInput: { maxLength: 200 } }} />
            {[[brands, 'brand_id', 'Brand'], [categories, 'category_id', 'Category']].map(([rows, field, label]) => (
              <TextField key={field} select label={label} name={field} required value={values[field]} onChange={change(field)} disabled={saving} error={Boolean(errors[field])} helperText={errors[field]} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                <option value="">{product?.[field] === null ? 'Unassigned (existing)' : `Select ${label.toLowerCase()}`}</option>
                {rows.filter((row) => row.active || row.id === product?.[field]).map((row) => <option key={row.id} value={row.id}>{row.name}{row.active ? '' : ' (inactive)'}</option>)}
              </TextField>
            ))}
            {['model', 'size', 'pattern', 'tyre_type'].map((field) => <TextField key={field} label={labels[field]} name={field} required={['model', 'size'].includes(field)} value={values[field]} onChange={change(field)} disabled={saving} error={Boolean(errors[field])} helperText={errors[field] || (field === 'size' ? 'For example, 195/65 R15' : '')} slotProps={{ htmlInput: { maxLength: 200 } }} />)}
            <TextField label="Default Selling Price (Rs.)" name="price" required value={values.price} onChange={change('price')} disabled={saving} error={Boolean(errors.price)} helperText={errors.price || 'In rupees, for example 24500 or 24500.50'} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
            <TextField label="Minimum Stock" name="minimum_stock" required value={values.minimum_stock} onChange={change('minimum_stock')} disabled={saving} error={Boolean(errors.minimum_stock)} helperText={errors.minimum_stock || 'Whole tyres'} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
            <TextField label="Notes" name="notes" multiline minRows={3} value={values.notes} onChange={change('notes')} disabled={saving} slotProps={{ htmlInput: { maxLength: 5000 } }} sx={{ gridColumn: '1 / -1' }} />
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving || (!product && missingOptions)}>{saving ? 'Saving…' : product ? 'Save Changes' : 'Create Product'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
