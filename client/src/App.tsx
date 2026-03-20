import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { PipelinesPage } from "./pages/PipelinesPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminConfigPage } from "./pages/AdminConfigPage";
import { PipelineLaunchPage } from "./pages/PipelineLaunchPage";
import { PipelineRunPage } from "./pages/PipelineRunPage";
import { PipelineLogsPage } from "./pages/PipelineLogsPage";
import { PipelineHistoryPage } from "./pages/PipelineHistoryPage";
import { AppShell } from "./components/layout/AppShell";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<PipelinesPage />} />
            <Route path="/project/:projectId/pipeline/:pipelineName" element={<PipelineLaunchPage />} />
            <Route path="/project/:projectId/pipeline/:pipelineName/history" element={<PipelineHistoryPage />} />
            <Route path="/project/:projectId/pipeline/:pipelineName/run/:runId" element={<PipelineRunPage />} />
            <Route path="/project/:projectId/pipeline/:pipelineName/run/:runId/job/:jobId/logs" element={<PipelineLogsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={<AdminConfigPage />} />
          </Route>
        </Routes>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}
