import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';

export default function AppLayout() {
  const { pathname } = useLocation();
  const content = useRef(null);
  useEffect(() => {
    content.current?.scrollTo(0, 0);
    content.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main ref={content} tabIndex={-1} id="main-content" className="min-h-0 flex-1 overflow-y-auto p-6 outline-none lg:p-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
