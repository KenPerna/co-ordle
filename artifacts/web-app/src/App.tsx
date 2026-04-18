import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Game from "@/pages/game";
import { Game as AnimatedGame } from "@/components/Game";
import { useEffect } from "react";

const queryClient = new QueryClient();

function DemoPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#111827", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 40 }}>
      <h1 style={{ color: "#f9fafb", fontWeight: 700, fontSize: 24, marginBottom: 24, letterSpacing: 4 }}>ANIMATION DEMO</h1>
      <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 32 }}>Secret word: CRANE — type a guess and press ENTER</p>
      <AnimatedGame secretWord="CRANE" />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Game} />
      <Route path="/game" component={Game} />
      <Route path="/demo" component={DemoPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
