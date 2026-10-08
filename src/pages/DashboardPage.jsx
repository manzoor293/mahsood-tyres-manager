import { useEffect, useState } from "react";
import { Alert, Button, SvgIcon, TextField } from "@mui/material";
import { catalogRequest } from "../utils/catalog.js";
import DashboardSummary from "../components/dashboard/DashboardSummary.jsx";
import { DashboardSkeleton } from "../components/dashboard/DashboardMetricCard.jsx";
import DashboardTrend from "../components/dashboard/DashboardTrend.jsx";
import {
  TopProducts,
  StockAlerts,
  RecentActivity,
} from "../components/dashboard/DashboardDetails.jsx";

export default function DashboardPage() {
  const [filters, setFilters] = useState({ period: "month" });
  const [custom, setCustom] = useState({ from_date: "", to_date: "" });
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    let live = true;
    setState({ loading: true, error: "", data: null });
    (async () => {
      try {
        if (!window.api?.dashboard)
          throw new Error(
            "Open the desktop application to view the dashboard.",
          );
        const data = await catalogRequest(() =>
          window.api.dashboard.getOverview(filters),
        );
        if (live) setState({ loading: false, error: "", data });
      } catch (error) {
        if (live)
          setState({ loading: false, error: error.message, data: null });
      }
    })();
    return () => {
      live = false;
    };
  }, [filters, revision]);
  const data = state.data;
  return (
    <section
      className="dashboard-page mx-auto min-w-0 max-w-screen-2xl"
      aria-labelledby="page-title"
    >
      <div className="dashboard-header flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1
            id="page-title"
            className="text-3xl font-semibold tracking-tight text-slate-800"
          >
            Dashboard
          </h1>
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-teal-700">
            Business overview
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Sales, spending and stock at a glance.
          </p>
          {data && (
            <div
              className="mt-4 text-xs leading-6 text-slate-500"
              data-dashboard-range
            >
              <p className="font-medium text-slate-700">
                {data.range.from} – {data.range.to}
              </p>
              <p>Both dates inclusive · {data.range.timeZone}</p>
              <p>Balances and stock are current across all dates.</p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <TextField
            select
            size="small"
            label="Period"
            name="dashboard-period"
            sx={{
              minWidth: 155,
              borderRadius: 2,
              backgroundColor: "white",
              "& .MuiOutlinedInput-root": { borderRadius: 2 },
            }}
            value={filters.period}
            onChange={(e) => {
              const period = e.target.value;
              setFilters(
                period === "custom"
                  ? {
                      period,
                      from_date: data?.range.from || custom.from_date,
                      to_date: data?.range.to || custom.to_date,
                    }
                  : { period },
              );
              if (period === "custom")
                setCustom({
                  from_date: data?.range.from || custom.from_date,
                  to_date: data?.range.to || custom.to_date,
                });
            }}
            slotProps={{ select: { native: true } }}
          >
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="custom">Custom range</option>
          </TextField>
          <Button
            variant="outlined"
            disabled={state.loading}
            onClick={refresh}
            sx={{ borderRadius: 2, backgroundColor: "white", px: 2 }}
            startIcon={
              <SvgIcon sx={{ fontSize: 18 }}>
                <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.93 9h-2.02A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h8V3z" />
              </SvgIcon>
            }
          >
            Refresh
          </Button>
        </div>
      </div>
      {filters.period === "custom" && (
        <form
          className="mb-4 flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ period: "custom", ...custom });
          }}
        >
          {["from_date", "to_date"].map((key) => (
            <TextField
              key={key}
              required
              size="small"
              type="date"
              name={`dashboard-${key}`}
              label={key === "from_date" ? "From date" : "To date"}
              value={custom[key]}
              onChange={(e) =>
                setCustom((c) => ({ ...c, [key]: e.target.value }))
              }
              slotProps={{ inputLabel: { shrink: true } }}
            />
          ))}
          <Button type="submit">Apply dates</Button>
        </form>
      )}
      {state.loading ? (
        <DashboardSkeleton />
      ) : state.error ? (
        <Alert
          severity="error"
          action={<Button onClick={refresh}>Retry</Button>}
        >
          {state.error}
        </Alert>
      ) : (
        data && (
          <>
            {!data.summary.saleCount &&
              !data.summary.purchaseCount &&
              !data.summary.expenses &&
              !data.recentActivity.length && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  No business activity in this period. Record sales, purchases
                  or expenses, or choose another period.
                </Alert>
              )}
            {data.summary.unknownCostItemCount > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Gross profit is incomplete: {data.summary.unknownCostItemCount}{" "}
                historical sale item(s) have zero cost, which may mean the
                purchase cost was unknown. No profit amount is shown.
              </Alert>
            )}
            <DashboardSummary summary={data.summary} />
            <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
              <DashboardTrend
                rows={data.salesTrend}
                grouping={data.range.grouping}
                summary={data.summary}
              />
              <TopProducts rows={data.topProducts} />
              <StockAlerts
                rows={data.stockAlerts}
                total={
                  data.summary.lowStockCount + data.summary.outOfStockCount
                }
              />
              <RecentActivity rows={data.recentActivity} />
            </div>
          </>
        )
      )}
    </section>
  );
}
