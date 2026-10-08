import { Paper, Skeleton } from "@mui/material";
import AppIcon from "../AppIcon.jsx";
import "./dashboard.css";

export default function DashboardMetricCard({ title, value, description, icon, tone = "slate", badge, emphasis }) {
  return (
    <Paper component="article" elevation={0} className={`dashboard-metric tone-${tone}${emphasis ? " dashboard-metric-primary" : ""}`} data-metric={title}>
      <div className="dashboard-metric-top">
        <span className="dashboard-icon"><AppIcon name={icon} size={20} /></span>
        <span className="dashboard-scope">{badge}</span>
      </div>
      <h3 className="dashboard-metric-title">{title}</h3>
      <p className="dashboard-metric-value">{value}</p>
      <p className="dashboard-metric-note">{description}</p>
    </Paper>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" aria-busy="true">
      <p className="mb-4 text-sm text-slate-500">Loading dashboard...</p>
      <div className="dashboard-loading-grid" aria-hidden="true">
        {Array.from({ length: 11 }, (_, index) => (
          <Paper key={index} elevation={0} className="dashboard-metric">
            <Skeleton variant="rounded" width={36} height={36} />
            <Skeleton width="60%" sx={{ mt: 2 }} />
            <Skeleton width="80%" height={44} />
            <Skeleton width="90%" />
          </Paper>
        ))}
      </div>
    </div>
  );
}
