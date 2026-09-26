import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import PurchaseDialog from "../components/purchases/PurchaseDialog.jsx";
import PurchaseDetails from "../components/purchases/PurchaseDetails.jsx";
import { catalogRequest, formatPrice } from "../utils/catalog.js";

const defaults = { search: "", supplier: "all", from: "", to: "", status: "all" };
export default function PurchasesPage() {
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(false);
  const [details, setDetails] = useState(null);
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        if (!window.api?.purchases)
          throw new Error("Open the desktop application to manage purchases.");
        const query = {
          search: filters.search,
          payment_status: filters.status,
          limit: 51,
          offset: page * 50,
        };
        if (filters.supplier !== "all") query.supplier_id = Number(filters.supplier);
        if (filters.from) query.from_date = filters.from;
        if (filters.to) query.to_date = filters.to;
        const supplierRows = [];
        for (let offset = 0; ; offset += 500) {
          const batch = await catalogRequest(() =>
            window.api.suppliers.list({ active: "all", limit: 500, offset }),
          );
          supplierRows.push(...batch);
          if (batch.length < 500) break;
        }
        const purchases = await catalogRequest(() =>
          window.api.purchases.list(query),
        );
        if (live) {
          setRows(purchases);
          setSuppliers(supplierRows);
        }
      } catch (error) {
        if (live) setError(error.message);
      } finally {
        if (live) setLoading(false);
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [filters, page, revision]);
  function filter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
  }
  async function view(id) {
    setBusy(true);
    setActionError("");
    try {
      setDetails(await catalogRequest(() => window.api.purchases.getById(id)));
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mx-auto min-w-0 max-w-screen-2xl"
      aria-labelledby="page-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 id="page-title" className="text-3xl font-semibold">
            Purchases
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Receive stock and track supplier invoices and balances.
          </p>
        </div>
        <Button
          variant="contained"
          disabled={loading || Boolean(error) || busy}
          onClick={() => setEditor(true)}
        >
          New Purchase
        </Button>
      </div>
      {actionError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {actionError}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ mt: 3, overflow: "hidden" }}>
        <div className="flex flex-wrap gap-3 p-5">
          <TextField
            size="small"
            label="Search purchases"
            name="purchase-search"
            value={filters.search}
            onChange={(e) => filter("search", e.target.value)}
            placeholder="Invoice or supplier"
          />
          <TextField
            select
            size="small"
            label="Supplier"
            name="purchase-filter-supplier"
            value={filters.supplier}
            onChange={(e) => filter("supplier", e.target.value)}
            slotProps={{ select: { native: true } }}
          >
            <option value="all">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {!s.active ? " (inactive)" : ""}
              </option>
            ))}
          </TextField>
          {["from", "to"].map((key) => (
            <TextField
              key={key}
              size="small"
              type="date"
              label={key === "from" ? "From date" : "To date"}
              name={`purchase-${key}`}
              value={filters[key]}
              onChange={(e) => filter(key, e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          ))}
          <TextField
            select
            size="small"
            label="Payment status"
            name="purchase-status"
            value={filters.status}
            onChange={(e) => filter("status", e.target.value)}
            slotProps={{ select: { native: true } }}
          >
            {["all", "unpaid", "partial", "paid", "credit"].map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All payments" : status}
              </option>
            ))}
          </TextField>
          <Button
            onClick={() => {
              setFilters(defaults);
              setPage(0);
            }}
          >
            Reset filters
          </Button>
        </div>
        {loading ? (
          <div
            role="status"
            className="flex min-h-64 items-center justify-center gap-3"
          >
            <CircularProgress size={24} />
            Loading purchases…
          </div>
        ) : error ? (
          <Alert
            severity="error"
            action={<Button onClick={refresh}>Retry</Button>}
          >
            {error}
          </Alert>
        ) : !rows.length ? (
          <div role="status" className="p-16 text-center">
            No purchases found. Create a purchase or adjust the filters.
          </div>
        ) : (
          <TableContainer>
            <Table size="small" aria-label="Purchases" sx={{ minWidth: 950 }}>
              <TableHead>
                <TableRow>
                  {[
                    "Invoice",
                    "Supplier",
                    "Date",
                    "Items",
                    "Total",
                    "Paid",
                    "Balance",
                    "Status",
                    "Actions",
                  ].map((label) => (
                    <TableCell key={label}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.slice(0, 50).map((row) => (
                  <TableRow key={row.id} data-purchase-id={row.id}>
                    <TableCell>{row.invoice_number}</TableCell>
                    <TableCell>{row.supplier_name}</TableCell>
                    <TableCell>{row.purchased_at.slice(0, 10)}</TableCell>
                    <TableCell>{row.item_count}</TableCell>
                    {[row.total, row.paid_amount, row.balance].map(
                      (value, i) => (
                        <TableCell key={i}>{formatPrice(value)}</TableCell>
                      ),
                    )}
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.payment_status}
                        color={
                          row.payment_status === "paid" ? "success" : "default"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        disabled={busy}
                        aria-label={`View purchase ${row.invoice_number}`}
                        onClick={() => view(row.id)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <div className="flex items-center justify-between p-3">
          <span className="text-sm text-slate-500">Page {page + 1}</span>
          <div>
            <Button
              disabled={loading || page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              disabled={loading || rows.length <= 50 || Boolean(error)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Paper>
      {editor && (
        <PurchaseDialog
          suppliers={suppliers}
          onClose={() => setEditor(false)}
          onSaved={() => {
            setEditor(false);
            setFilters(defaults);
            setPage(0);
            refresh();
          }}
        />
      )}
      {details && (
        <PurchaseDetails purchase={details} onClose={() => setDetails(null)} />
      )}
    </section>
  );
}
