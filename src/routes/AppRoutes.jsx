import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import AppLayout from '../layouts/AppLayout.jsx';
import PlaceholderPage from '../pages/PlaceholderPage.jsx';
const ProductsPage = lazy(() => import('../pages/ProductsPage.jsx'));
const InventoryPage = lazy(() => import('../pages/InventoryPage.jsx'));
const PurchasesPage = lazy(() => import('../pages/PurchasesPage.jsx'));
const SuppliersPage = lazy(() => import('../pages/SuppliersPage.jsx'));
const CustomersPage = lazy(() => import('../pages/CustomersPage.jsx'));
const SalesPage = lazy(() => import('../pages/SalesPage.jsx'));
const ExpensesPage = lazy(() => import('../pages/ExpensesPage.jsx'));
const DashboardPage = lazy(() => import('../pages/DashboardPage.jsx'));
import { navigation } from './navigation.js';
const implementedPages = { '/dashboard': DashboardPage, '/products': ProductsPage, '/suppliers': SuppliersPage, '/purchases': PurchasesPage, '/inventory': InventoryPage, '/customers': CustomersPage, '/sales': SalesPage, '/expenses': ExpensesPage };

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        {navigation.map((page) => {
          const Page = implementedPages[page.path];
          return <Route key={page.path} path={page.path} element={Page ? <Suspense fallback={<p role="status">Loading {page.title.toLowerCase()}...</p>}><Page /></Suspense> : <PlaceholderPage {...page} />} />;
        })}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
