export default function App() {
  return (
    <main>
      <p className="eyebrow">MAHSOOD</p>
      <h1>Mahsood Tyre Manager</h1>
      <p className="subtitle">Sales, Inventory &amp; Shop Management System</p>
      <p className="status">
        {window.desktop?.isElectron ? 'Desktop application is ready.' : 'Browser preview'}
      </p>
    </main>
  );
}
