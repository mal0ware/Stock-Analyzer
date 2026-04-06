import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import SymbolDetail from './pages/SymbolDetail';
import Watchlist from './pages/Watchlist';
import Anomalies from './pages/Anomalies';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="symbol/:symbol" element={<SymbolDetail />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="anomalies" element={<Anomalies />} />
      </Route>
    </Routes>
  );
}
