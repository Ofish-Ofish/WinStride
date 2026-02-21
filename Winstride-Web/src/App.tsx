import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/layout/Layout';
import SecurityDashboard from './modules/security/SecurityDashboard';
import PowerShellDashboard from './modules/powershell/PowerShellDashboard';
import SysmonDashboard from './modules/sysmon/SysmonDashboard';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/security" replace />} />
            <Route path="/security" element={<SecurityDashboard />} />
            <Route path="/powershell" element={<PowerShellDashboard />} />
            <Route path="/sysmon" element={<SysmonDashboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
