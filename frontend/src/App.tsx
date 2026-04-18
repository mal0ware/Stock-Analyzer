import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import SymbolDetail from './pages/SymbolDetail';
import Watchlist from './pages/Watchlist';
import Anomalies from './pages/Anomalies';
import Learn from './pages/Learn';

const Simulator = lazy(() => import('./pages/Simulator'));

function SimulatorFallback() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-9 w-56" />
      <div className="skeleton h-12 w-full rounded-lg" />
      <div className="skeleton h-[500px] w-full rounded-xl" />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="symbol/:symbol" element={<SymbolDetail />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="anomalies" element={<Anomalies />} />
        <Route path="simulator" element={
          <Suspense fallback={<SimulatorFallback />}>
            <Simulator />
          </Suspense>
        } />
        <Route path="learn" element={<Learn />} />
      </Route>
    </Routes>
  );
}
