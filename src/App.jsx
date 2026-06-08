import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Shield, History, Settings, BarChart3 } from 'lucide-react';
import ScannerView from './pages/ScannerView';
import HistoryView from './pages/HistoryView';
import SettingsView from './pages/SettingsView';
import ReviewScan from './pages/ReviewScan';
import DashboardView from './pages/DashboardView';


function Layout({ children }) {
  const location = useLocation();
  
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-screen-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500 font-bold text-lg tracking-tight">
            <Shield className="w-6 h-6" />
            <span>VeritasRecruit</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-md w-full mx-auto p-4 flex flex-col relative">
        {children}
      </main>

      <nav className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe sticky bottom-0 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="max-w-screen-md mx-auto flex">
          <Link to="/" className={`flex-1 flex flex-col items-center justify-center py-3 transition-colors ${location.pathname === '/' ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
            <Shield className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Scanner</span>
          </Link>
          <Link to="/history" className={`flex-1 flex flex-col items-center justify-center py-3 transition-colors ${location.pathname === '/history' ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
            <History className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">History</span>
          </Link>
          <Link to="/dashboard" className={`flex-1 flex flex-col items-center justify-center py-3 transition-colors ${location.pathname === '/dashboard' ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
            <BarChart3 className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Dashboard</span>
          </Link>
          <Link to="/settings" className={`flex-1 flex flex-col items-center justify-center py-3 transition-colors ${location.pathname === '/settings' ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
            <Settings className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Settings</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<ScannerView />} />
          <Route path="/review" element={<ReviewScan />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/dashboard" element={<DashboardView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
