import { useState } from "react";
import { pairPrice, stockLabel, parseWholeQuantity } from '../../utils/units.js';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import {
  catalogApi,
  catalogRequest,
  parsePrice,
  priceInput,
} from "../../utils/catalog.js";

const labels = {
  sku: "SKU",
  model: "Model",
  size: "Size",
  pattern: "Pattern",
  tyre_type: "Tyre Type",
  notes: "Notes",
};

export default function ProductDialog({
  product,
  brands,
  categories,
  onClose,
  onSaved,
}) {
  const [values, setValues] = useState(() => ({
    sku: product?.sku || "",
    brand_id: product?.brand_id ?? "",
    category_id: product?.category_id ?? "",
    model: product?.model || "",
    size: product?.size || "",
    pattern: product?.pattern || "",
    tyre_type: product?.tyre_type || "",
    price: product && pairPrice(product) !== null ? priceInput(pairPrice(product)) : "",
    minimum_stock: product?.minimum_stock % 2 ? "" : String((product?.minimum_stock ?? 0) / 2),
    notes: product?.notes || "",
  }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editedUnits, setEditedUnits] = useState({ price: false, minimum_stock: false });
  const missingOptions =
    !brands.some((row) => row.active) || !categories.some((row) => row.active);
  const change = (field) => (event) => {
    if (field === 'price' || field === 'minimum_stock') setEditedUnits(current => ({ ...current, [field]: true }));
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setError("");
  };
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const nextErrors = {};
    for (const field of ["sku", "model", "size"])
      if (!values[field].trim())
        nextErrors[field] = `${labels[field]} is required.`;
    for (const field of ["brand_id", "category_id"]) {
      if (!values[field] && !(product && product[field] === null))
        nextErrors[field] =
          `Select a ${field === "brand_id" ? "brand" : "category"}.`;
    }
    const price = parsePrice(values.price);
    if (price === null && (!product || editedUnits.price))
      nextErrors.price =
        "Enter a nonnegative rupee amount with up to 2 decimal places.";
    const minimum = parseWholeQuantity(values.minimum_stock, 0);
    if (minimum === null && (!product || editedUnits.minimum_stock))
      nextErrors.minimum_stock = "Enter a nonnegative whole number.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    setError("");
    try {
      const data = {
        sku: values.sku,
        model: values.model,
        size: values.size,
        pattern: values.pattern,
        tyre_type: values.tyre_type,
        notes: values.notes,
      };
      if (!product || editedUnits.price) data.default_selling_price = price;
      if (!product || editedUnits.minimum_stock) data.minimum_stock = minimum;
      for (const field of ["brand_id", "category_id"])
        if (values[field] !== "") data[field] = Number(values[field]);
      const api = catalogApi();
      await catalogRequest(() =>
        product
          ? api.products.update(product.id, data)
          : api.products.create(data),
      );
      onSaved(product ? "Product updated." : "Product added.");
    } catch (failure) {
      setError(failure.message);
      if (failure.code === "CONFLICT")
        setErrors({
          sku: "This SKU is already in use, including by inactive products.",
        });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onClose={() => {
        if (!saving) onClose();
      }}
      fullWidth
      maxWidth="md"
      aria-labelledby="product-dialog-title"
    >
      <form onSubmit={submit} noValidate>
        <DialogTitle id="product-dialog-title">
          {product ? "Edit Product" : "Add Product"}
        </DialogTitle>
        <DialogContent dividers>
          <p className="mb-5 text-sm text-slate-500">
            Product details and pricing. Stock is managed separately.
          </p>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {missingOptions && (
            <Alert severity="info" sx={{ mb: 2 }}>
              An active brand and category are needed for a new product.{" "}
              {product
                ? "Existing selections can be retained."
                : "Close this form and use Manage Brands or Manage Categories to add them."}
            </Alert>
          )}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField
              label="SKU"
              name="sku"
              required
              autoFocus
              value={values.sku}
              onChange={change("sku")}
              disabled={saving}
              error={Boolean(errors.sku)}
              helperText={errors.sku}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            {[
              [brands, "brand_id", "Brand"],
              [categories, "category_id", "Category"],
            ].map(([rows, field, label]) => (
              <TextField
                key={field}
                select
                label={label}
                name={field}
                required
                value={values[field]}
                onChange={change(field)}
                disabled={saving}
                error={Boolean(errors[field])}
                helperText={errors[field]}
                slotProps={{
                  select: { native: true },
                  inputLabel: { shrink: true },
                }}
              >
                <option value="">
                  {product?.[field] === null
                    ? "Unassigned (existing)"
                    : `Select ${label.toLowerCase()}`}
                </option>
                {rows
                  .filter((row) => row.active || row.id === product?.[field])
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                      {row.active ? "" : " (inactive)"}
                    </option>
                  ))}
              </TextField>
            ))}
            {["model", "size", "pattern", "tyre_type"].map((field) => (
              <TextField
                key={field}
                label={labels[field]}
                name={field}
                required={["model", "size"].includes(field)}
                value={values[field]}
                onChange={change(field)}
                disabled={saving}
                error={Boolean(errors[field])}
                helperText={
                  errors[field] ||
                  (field === "size" ? "For example, 195/65 R15" : "")
                }
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
            ))}
            <TextField
              label="Selling Price / Pair (Rs.)"
              name="price"
              required={!product || editedUnits.price}
              value={values.price}
              onChange={change("price")}
              disabled={saving}
              error={Boolean(errors.price)}
              helperText={
                errors.price || (product?.price_units_per_unit === 1 && !editedUnits.price
                  ? "Equivalent pair price. The existing per-tyre price is preserved until you change this field."
                  : "In rupees per pair, for example 24500 or 24500.50")
              }
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
            />
            <TextField
              label="Minimum Stock (Pairs)"
              name="minimum_stock"
              required={!product || editedUnits.minimum_stock}
              value={values.minimum_stock}
              onChange={change("minimum_stock")}
              disabled={saving}
              error={Boolean(errors.minimum_stock)}
              helperText={errors.minimum_stock || (product?.minimum_stock % 2 && !editedUnits.minimum_stock ? `${stockLabel(product.minimum_stock)} (legacy threshold). Leave unchanged to preserve it.` : 'Whole pairs; 1 pair = 2 tyres')}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
            />
            <TextField
              label="Notes"
              name="notes"
              multiline
              minRows={3}
              value={values.notes}
              onChange={change("notes")}
              disabled={saving}
              slotProps={{ htmlInput: { maxLength: 5000 } }}
              sx={{ gridColumn: "1 / -1" }}
            />
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={saving || (!product && missingOptions)}
          >
            {saving ? "Saving…" : product ? "Save Changes" : "Create Product"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
