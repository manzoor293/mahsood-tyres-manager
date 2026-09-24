import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import AppLayout from '../layouts/AppLayout.jsx';
import PlaceholderPage from '../pages/PlaceholderPage.jsx';
const ProductsPage = lazy(() => import('../pages/ProductsPage.jsx'));
import { navigation } from './navigation.js';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        {navigation.map((page) => <Route key={page.path} path={page.path} element={page.path === '/products' ? <Suspense fallback={<p role="status">Loading products…</p>}><ProductsPage /></Suspense> : <PlaceholderPage {...page} />} />)}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
