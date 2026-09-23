const paths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  tyre: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 3v3 M12 18v3 M3 12h3 M18 12h3',
  truck: 'M3 5h11v12H3z M14 9h4l3 4v4h-7 M5 17v3h3v-3 M16 17v3h3v-3',
  bag: 'M4 7h16l-1 14H5z M8 7V5a4 4 0 0 1 8 0v2',
  receipt: 'M5 3h14v18l-3-2-4 2-4-2-3 2z M8 8h8 M8 12h8 M8 16h4',
  people: 'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 21v-3a7 7 0 0 1 14 0v3 M19 5a3 3 0 0 1 0 6 M21 15l1 5',
  wallet: 'M20 7V4H4a2 2 0 0 0 0 4h17v12H4a2 2 0 0 1-2-2V6 M21 12h-6v4h6',
  chart: 'M3 3v18h18 M7 16v-5 M12 16V7 M17 16V4',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
};

export default function AppIcon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name] || paths.dashboard} />
    </svg>
  );
}
