import ListItemButton from '@mui/material/ListItemButton';
import { NavLink } from 'react-router-dom';
import { navigation } from '../routes/navigation.js';
import AppIcon from './AppIcon.jsx';

export default function Sidebar() {
  return (
    <aside className="flex h-full w-52 shrink-0 flex-col bg-slate-900 text-slate-300 lg:w-60">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300"><AppIcon name="tyre" size={26} /></div>
        <div><p className="text-sm font-bold tracking-widest text-white">MAHSOOD</p><p className="mt-1 text-xs text-slate-400">Tyre Manager</p></div>
      </div>
      <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-6">
        <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.18em] text-slate-500">WORKSPACE</p>
        {navigation.map((item) => (
          <ListItemButton key={item.path} component={NavLink} to={item.path} sx={{
            gap: 1.5, borderRadius: 2, mb: 0.5, px: 1.5, py: 1.25, fontSize: 14,
            '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
            '&.active': { backgroundColor: '#134e4a', color: '#99f6e4', fontWeight: 600 },
            '&.Mui-focusVisible': { outline: '2px solid #2dd4bf', outlineOffset: -2 },
          }}>
            <AppIcon name={item.icon} /><span>{item.title}</span>
          </ListItemButton>
        ))}
      </nav>
      <div className="border-t border-white/10 px-6 py-4 text-xs text-slate-500">Shop management workspace</div>
    </aside>
  );
}
