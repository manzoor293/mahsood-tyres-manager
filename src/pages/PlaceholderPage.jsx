import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import AppIcon from '../components/AppIcon.jsx';

export default function PlaceholderPage({ title, description, icon }) {
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-6xl">
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-400">Workspace</p>
      <h1 id="page-title" className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
      <Paper variant="outlined" sx={{ mt: 4, borderColor: '#e2e8f0', boxShadow: '0 2px 6px rgb(15 23 42 / 2%)' }}>
        <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><AppIcon name={icon} size={28} /></div>
          <h2 className="text-lg font-semibold text-slate-800">Your {title.toLowerCase()} workspace</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">This section is ready for future development.<br />Features have not been added yet.</p>
          <Chip label="Coming soon" size="small" variant="outlined" sx={{ mt: 3, color: '#64748b', borderColor: '#e2e8f0', fontSize: 11 }} />
        </div>
      </Paper>
    </section>
  );
}
