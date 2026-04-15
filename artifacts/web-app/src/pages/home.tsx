import { getHealthCheckQueryKey, useHealthCheck } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Terminal, Activity, ArrowRight, Zap, Database, Server } from "lucide-react";

export default function Home() {
  const { data: health, isLoading, isError } = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: 5000,
    }
  });

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="max-w-5xl mx-auto px-6 py-12 flex flex-col gap-12">
        {/* Header / Hero */}
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 text-primary flex items-center justify-center font-bold font-mono">
              NB
            </div>
            <h1 className="text-3xl font-bold tracking-tight">NodeBase</h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Your high-performance Node.js starter is running. Control your application, monitor health, and build fast.
          </p>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Health Status Card */}
          <Card className="col-span-1 md:col-span-2 border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-mono text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4" />
                SYSTEM_STATUS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {isLoading ? (
                    <Skeleton className="w-4 h-4 rounded-full" />
                  ) : isError ? (
                    <div className="w-4 h-4 rounded-full bg-destructive animate-pulse" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                  )}
                  <div className="flex flex-col">
                    <span className="text-2xl font-mono font-bold uppercase tracking-wider">
                      {isLoading ? "CHECKING..." : isError ? "OFFLINE" : health?.status || "UNKNOWN"}
                    </span>
                    <span className="text-xs text-muted-foreground">Main API Server</span>
                  </div>
                </div>
                <div className="text-right flex flex-col gap-1">
                  <span className="text-xs font-mono text-muted-foreground">UPTIME</span>
                  <span className="text-sm font-mono text-primary">LIVE</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions Card */}
          <Card className="col-span-1 border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-mono text-muted-foreground flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                QUICK_ACTIONS
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button variant="outline" className="w-full justify-start font-mono text-xs hover:text-primary transition-colors border-border/50">
                <Database className="w-3 h-3 mr-2" />
                VIEW_DATABASE
              </Button>
              <Button variant="outline" className="w-full justify-start font-mono text-xs hover:text-primary transition-colors border-border/50">
                <Server className="w-3 h-3 mr-2" />
                SERVER_LOGS
              </Button>
            </CardContent>
          </Card>

        </div>

        {/* What to build next */}
        <section className="flex flex-col gap-6">
          <h2 className="text-lg font-mono text-muted-foreground border-b border-border/50 pb-2">/ NEXT_STEPS</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="group flex flex-col gap-3 p-5 border border-border/50 hover:border-primary/50 bg-card/20 hover:bg-primary/5 transition-all duration-300">
              <div className="w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center">
                <Database className="w-4 h-4" />
              </div>
              <h3 className="font-bold">Define Schema</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Add Drizzle ORM schemas in <code className="text-xs bg-muted px-1 py-0.5 rounded text-foreground">lib/db/src/schema</code> and run migrations to build your data model.
              </p>
            </div>

            <div className="group flex flex-col gap-3 p-5 border border-border/50 hover:border-primary/50 bg-card/20 hover:bg-primary/5 transition-all duration-300">
              <div className="w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="font-bold">Create Endpoints</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Define routes in <code className="text-xs bg-muted px-1 py-0.5 rounded text-foreground">artifacts/api-server</code>. The OpenAPI spec automatically updates.
              </p>
            </div>

            <div className="group flex flex-col gap-3 p-5 border border-border/50 hover:border-primary/50 bg-card/20 hover:bg-primary/5 transition-all duration-300">
              <div className="w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center">
                <Terminal className="w-4 h-4" />
              </div>
              <h3 className="font-bold">Build UI</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Use the generated React Query hooks to consume your APIs right here in <code className="text-xs bg-muted px-1 py-0.5 rounded text-foreground">artifacts/web-app</code>.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
