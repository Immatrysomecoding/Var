import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Courtside from "./pages/Courtside";
import Spectator from "./pages/Spectator";

function Router() {
  return (
    <Switch>
      {/* Landing — courtside monitor entry point */}
      <Route path="/" component={Home} />

      {/* Courtside operator interface */}
      <Route path="/courtside" component={Courtside} />

      {/* Spectator viewer — opened via QR code scan */}
      <Route path="/f/:sessionId" component={Spectator} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
