import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useBLE } from '@/hooks/useBLE';
import Home from "./pages/Home";
import ManualMission from "./pages/ManualMission";
import AutonomousMission from "./pages/AutonomousMission";
import { Gallery } from "./pages/Gallery";
import Missions from "./pages/Missions";
import { Navigation } from "./components/Navigation";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const bleService = useBLE();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Navigation bleService={bleService} />
          <Routes>
            <Route path="/" element={<Home bleService={bleService} />} />
            <Route path="/manual-mission" element={<ManualMission bleService={bleService} />} />
            <Route path="/autonomous-mission" element={<AutonomousMission bleService={bleService} />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/missions" element={<Missions />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
