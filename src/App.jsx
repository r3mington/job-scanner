import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Shield, History, Settings, BarChart3, LogOut, Loader2 } from 'lucide-react';
import ScannerView from './pages/ScannerView';
import logo from './assets/logo.png';
import HistoryView from './pages/HistoryView';
import SettingsView from './pages/SettingsView';
import ReviewScan from './pages/ReviewScan';
import DashboardView from './pages/DashboardView';
import LoginView from './pages/LoginView';
import TraffickerProfileView from './pages/TraffickerProfileView';
import DecoyContactView from './pages/DecoyContactView';
import { AuthProvider, useAuth } from './context/AuthContext';

function Layout({ children }) {
  const location = useLocation();
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-[#0d1117] text-slate-300">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" />
        <p className="text-slate-500 text-sm font-mono">Initializing Sentinel AI...</p>
      </div>
    );
  }

  // Redirect to Login if unauthenticated
  if (!user) {
    return (
      <div className="flex flex-col min-h-screen bg-[#0d1117]">
        <main className="flex-1 flex flex-col justify-center">
          <LoginView />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0d1117] text-slate-300 font-sans">
      {/* Desktop Sidebar (visible on md screens and up) */}
      <aside className="w-64 border-r border-slate-800 bg-[#111318] flex flex-col justify-between hidden md:flex sticky top-0 h-screen p-5 flex-shrink-0">
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <Link to="/" className="flex items-center bg-[#0a0f18] px-3 py-1 rounded border border-slate-850 shadow-sm transition-colors hover:border-amber-500/20">
              <img src={logo} alt="Sentinel AI Logo" className="h-7 w-auto object-contain" />
            </Link>
          </div>
          <nav className="flex flex-col gap-1.5 font-mono text-xs uppercase tracking-wider">
            <Link to="/" className={`flex items-center gap-3 px-3 py-2.5 rounded transition-all border ${location.pathname === '/' ? 'bg-[#0a0f18] border-slate-800 text-amber-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}>
              <Shield className="w-4 h-4" />
              <span>Scanner</span>
            </Link>
            <Link to="/history" className={`flex items-center gap-3 px-3 py-2.5 rounded transition-all border ${location.pathname === '/history' ? 'bg-[#0a0f18] border-slate-800 text-amber-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}>
              <History className="w-4 h-4" />
              <span>History</span>
            </Link>
            <Link to="/dashboard" className={`flex items-center gap-3 px-3 py-2.5 rounded transition-all border ${location.pathname === '/dashboard' ? 'bg-[#0a0f18] border-slate-800 text-amber-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}>
              <BarChart3 className="w-4 h-4" />
              <span>Dashboard</span>
            </Link>
            <Link to="/settings" className={`flex items-center gap-3 px-3 py-2.5 rounded transition-all border ${location.pathname === '/settings' ? 'bg-[#0a0f18] border-slate-800 text-amber-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}>
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </Link>
          </nav>
        </div>
        <div className="border-t border-slate-800 pt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 font-mono">USER EMAIL:</span>
            <span className="text-xs text-slate-350 truncate">{user.email}</span>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 py-2 bg-slate-900 hover:bg-red-950/20 hover:text-red-400 border border-slate-850 rounded text-slate-400 text-xs font-mono font-bold uppercase transition-colors"
          >
            <LogOut className="w-4 h-4" /> Log Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Mobile Header (visible only on mobile) */}
        <header className="md:hidden bg-[#111318] border-b border-slate-800 sticky top-0 z-10 p-4 flex items-center justify-between shadow-sm">
          <Link to="/" className="flex items-center bg-[#0a0f18] px-3 py-1 rounded border border-slate-850 shadow-sm">
            <img src={logo} alt="Sentinel AI Logo" className="h-6 w-auto object-contain" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 truncate max-w-[120px]">{user.email}</span>
            <button
              onClick={signOut}
              className="p-1 text-slate-550 hover:text-red-500 rounded transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-screen-md w-full mx-auto p-4 flex flex-col relative pb-20 md:pb-4">
          {children}
        </main>

        {/* Mobile Bottom Navigation (visible only on mobile) */}
        <nav className="md:hidden bg-[#111318] border-t border-slate-800 sticky bottom-0 z-10 shadow-lg flex pb-safe">
          <Link to="/" className={`flex-1 flex flex-col items-center justify-center py-2.5 transition-colors ${location.pathname === '/' ? 'text-amber-450 font-bold' : 'text-slate-500 hover:text-slate-300'}`}>
            <Shield className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-mono uppercase tracking-wider">Scanner</span>
          </Link>
          <Link to="/history" className={`flex-1 flex flex-col items-center justify-center py-2.5 transition-colors ${location.pathname === '/history' ? 'text-amber-450 font-bold' : 'text-slate-500 hover:text-slate-300'}`}>
            <History className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-mono uppercase tracking-wider">History</span>
          </Link>
          <Link to="/dashboard" className={`flex-1 flex flex-col items-center justify-center py-2.5 transition-colors ${location.pathname === '/dashboard' ? 'text-amber-450 font-bold' : 'text-slate-500 hover:text-slate-300'}`}>
            <BarChart3 className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-mono uppercase tracking-wider">Dashboard</span>
          </Link>
          <Link to="/settings" className={`flex-1 flex flex-col items-center justify-center py-2.5 transition-colors ${location.pathname === '/settings' ? 'text-amber-450 font-bold' : 'text-slate-500 hover:text-slate-300'}`}>
            <Settings className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-mono uppercase tracking-wider">Settings</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<ScannerView />} />
            <Route path="/review" element={<ReviewScan />} />
            <Route path="/history" element={<HistoryView />} />
            <Route path="/dashboard" element={<DashboardView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="/trafficker/:contactId" element={<TraffickerProfileView />} />
            <Route path="/decoy-contact" element={<DecoyContactView />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
