import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import UnitySync from "./pages/UnitySync";
import Controls from "./pages/Controls";
import SnapchatSync from "./pages/SnapchatSync";
import MetaSync from "./pages/MetaSync";
import GoogleAdsSync from "./pages/GoogleAdsSync";
import Schedules from "./pages/Schedules";
import Reporting from "./pages/Reporting";
import CompetitorWatchlist from "./pages/CompetitorWatchlist";
import FTDReporting from "./pages/FTDReporting";
import HoursCreatives from "./pages/HoursCreatives";
import CreativeScanner from "./pages/CreativeScanner";
import CreativeBoardView from "./pages/CreativeBoardView";
import Demo from "./pages/Demo";
import DemoReporting from "./pages/DemoReporting";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/unity-sync" element={<UnitySync />} />
          <Route path="/controls" element={<Controls />} />
          <Route path="/snapchat-sync" element={<SnapchatSync />} />
          <Route path="/meta-sync" element={<MetaSync />} />
          <Route path="/google-ads-sync" element={<GoogleAdsSync />} />
          <Route path="/schedules" element={<Schedules />} />
          <Route path="/reporting" element={<Reporting />} />
          <Route path="/competitor-watchlist" element={<CompetitorWatchlist />} />
          <Route path="/ftd-reporting" element={<FTDReporting />} />
          <Route path="/hours-creatives" element={<HoursCreatives />} />
          <Route path="/creative-scanner" element={<CreativeScanner />} />
          <Route path="/creative-board" element={<CreativeBoardView />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/demo/reporting" element={<DemoReporting />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
