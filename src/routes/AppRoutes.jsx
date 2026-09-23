import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout.jsx';
import PlaceholderPage from '../pages/PlaceholderPage.jsx';
import { navigation } from './navigation.js';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        {navigation.map((page) => <Route key={page.path} path={page.path} element={<PlaceholderPage {...page} />} />)}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
