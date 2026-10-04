import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Tabs,
  Tab,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
} from "@mui/material";
import ReportLookup from "../components/reports/ReportLookup.jsx";
import PrintPreview from "../components/printing/PrintPreview.jsx";
import PrintActions from "../components/printing/PrintActions.jsx";
import { catalogRequest, formatPrice } from "../utils/catalog.js";

const types = {
  sale: ["Sale", "saleInvoice"],
  purchase: ["Purchase", "purchaseInvoice"],
  payment: ["Payment", null],
  saleReturn: ["Sale Return", "saleReturn"],
  purchaseReturn: ["Purchase Return", "purchaseReturn"],
};
const columns = [
  "S.NO",
  "Date / Time",
  "Type",
  "Reference",
  "Document No.",
  "Description",
  "Debit (Increase)",
  "Credit (Decrease)",
  "Running Balance",
];
export default function LedgerPage() {
  const [partyType, setPartyType] = useState("customer"),
    [party, setParty] = useState(null);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [query, setQuery] = useState(null);
  const [offset, setOffset] = useState(0),
    [limit, setLimit] = useState(25),
    [revision, setRevision] = useState(0);
  const [state, setState] = useState({ data: null, loading: false, error: "" }),
    [preview, setPreview] = useState(false);
  const customer = partyType === "customer";
  useEffect(() => {
    let live = true;
    if (!query) {
      setState({ data: null, loading: false, error: "" });
      return;
    }
    setState({ data: null, loading: true, error: "" });
    catalogRequest(() =>
      window.api.ledger.getStatement({ ...query, offset, limit }),
    )
      .then((data) => {
        if (live) setState({ data, loading: false, error: "" });
      })
      .catch((error) => {
        if (live)
          setState({ data: null, loading: false, error: error.message });
      });
    return () => {
      live = false;
    };
  }, [query, offset, limit, revision]);
  function reset(type = partyType) {
    setPartyType(type);
    setParty(null);
    setFrom("");
    setTo("");
    setQuery(null);
    setOffset(0);
    setPreview(false);
  }
  function apply() {
    if (from && to && from > to) {
      setState((s) => ({ ...s, error: "From date must not follow To date." }));
      return;
    }
    setOffset(0);
    setQuery({
      party_type: partyType,
      party_id: party.id,
      ...(from ? { from_date: from } : {}),
      ...(to ? { to_date: to } : {}),
    });
  }
  const data = state.data;
  const metrics = data
    ? [
        ["Opening Balance", data.openingBalance],
        [customer ? "Total Sales" : "Total Purchases", data.totals.invoices],
        ["Total Payments", data.totals.payments],
        [
          customer ? "Total Sale Returns" : "Total Purchase Returns",
          data.totals.returns,
        ],
        ["Closing Balance", data.closingBalance],
      ]
    : [];
  return (
    <section data-ledger-page>
      <h1 className="text-2xl font-semibold mb-4">Ledger</h1>
      <Tabs
        value={partyType}
        onChange={(_, type) => reset(type)}
        aria-label="Ledger account type"
      >
        <Tab value="customer" label="Customer Ledger" />
        <Tab value="supplier" label="Supplier Ledger" />
      </Tabs>
      <div className="my-4 flex flex-wrap gap-3 items-start">
        <ReportLookup
          key={partyType}
          field={customer ? "customer_id" : "supplier_id"}
          value={party}
          onChange={(row) => {
            setParty(row);
            setQuery(
              row
                ? {
                    party_type: partyType,
                    party_id: row.id,
                    ...(from ? { from_date: from } : {}),
                    ...(to ? { to_date: to } : {}),
                  }
                : null,
            );
            setOffset(0);
          }}
        />
        <TextField
          label="From Date"
          name="ledger-from"
          type="date"
          size="small"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="To Date"
          name="ledger-to"
          type="date"
          size="small"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button
          variant="contained"
          disabled={!party || state.loading}
          onClick={apply}
        >
          Apply filters
        </Button>
        <Button onClick={() => reset()}>Reset filters</Button>
      </div>
      {state.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {state.error}
          <Button onClick={() => setRevision((r) => r + 1)}>Retry</Button>
        </Alert>
      )}
      {state.loading && <p role="status">Loading ledger...</p>}
      {!query && (
        <p>
          Select a customer or supplier to view their complete account history.
        </p>
      )}
      {data && (
        <>
          <div className="bg-white rounded-xl p-4 mb-4 border border-slate-200">
            <h2 className="font-semibold">{data.party.name}</h2>
            {data.party.phone && <p>{data.party.phone}</p>}
            {data.party.address && <p>{data.party.address}</p>}
            <p>{data.party.active ? "Active" : "Inactive"} account</p>
            <p>
              {data.period.from || data.period.to
                ? `${data.period.from || "Beginning"} to ${data.period.to || "Latest"}`
                : "Complete Account History"}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
            {metrics.map(([label, value]) => (
              <div
                key={label}
                className="bg-white rounded-xl p-4 border border-slate-200"
                data-ledger-metric={label}
              >
                <p className="text-sm text-slate-500">{label}</p>
                <p className="font-semibold">{formatPrice(value)}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-600 mb-3">
            Increase: invoices. Decrease: payments and returns. Positive
            balance: {customer ? "customer owes shop" : "shop owes supplier"}.
            Negative balance:{" "}
            {customer
              ? "customer credit / refund due"
              : "supplier credit due to shop"}
            . Returns adjust the account; they do not record a cash refund.
          </p>
          {data.reconciliation.unallocatedPayments > 0 && (
            <Alert severity="info">
              Includes legacy unallocated payments omitted from existing
              invoice-based reports.
            </Alert>
          )}
          <TableContainer sx={{ backgroundColor: "white", borderRadius: 2 }}>
            <Table
              size="small"
              sx={{ minWidth: 1150 }}
              aria-label="Ledger transactions"
            >
              <TableHead>
                <TableRow>
                  {columns.map((label, index) => (
                    <TableCell key={label} align={index > 5 ? "right" : "left"}>
                      {label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.entries.map((row) => (
                  <TableRow key={`${row.type}-${row.id}`}>
                    <TableCell>{row.serial}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {row.occurred_at.length === 10
                        ? row.occurred_at
                        : row.local_time}
                    </TableCell>
                    <TableCell>{types[row.type][0]}</TableCell>
                    <TableCell>
                      <PrintActions
                        type={
                          row.type === "payment"
                            ? customer
                              ? "customerPayment"
                              : "supplierPayment"
                            : types[row.type][1]
                        }
                        documentId={row.id}
                        label={row.reference}
                      />
                    </TableCell>
                    <TableCell>{row.document_number || "—"}</TableCell>
                    <TableCell sx={{ minWidth: 180, overflowWrap: "anywhere" }}>
                      {row.description}
                    </TableCell>
                    {[row.increase, row.decrease, row.balance].map(
                      (value, index) => (
                        <TableCell
                          align="right"
                          key={index}
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          {formatPrice(value)}
                        </TableCell>
                      ),
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {!data.entries.length && (
            <p className="p-4">
              {data.totalRows
                ? "No transactions on this page."
                : data.period.from || data.period.to
                  ? "No transactions in the selected date range."
                  : "This account has no transactions."}
            </p>
          )}
          <TablePagination
            component="div"
            count={data.totalRows}
            page={Math.floor(offset / limit)}
            rowsPerPage={limit}
            rowsPerPageOptions={[25, 50, 100]}
            onPageChange={(_, page) => setOffset(page * limit)}
            onRowsPerPageChange={(event) => {
              setLimit(Number(event.target.value));
              setOffset(0);
            }}
          />
          <Button variant="outlined" onClick={() => setPreview(true)}>
            Preview / Print / Save as PDF
          </Button>
        </>
      )}
      {preview && query && (
        <PrintPreview ledgerFilters={query} onClose={() => setPreview(false)} />
      )}
    </section>
  );
}
