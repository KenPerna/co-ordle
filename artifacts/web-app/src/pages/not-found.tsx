import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Terminal, ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center font-sans">
      <div className="max-w-md w-full px-6 py-12 flex flex-col items-center text-center gap-6">
        <div className="w-16 h-16 bg-destructive/10 text-destructive flex items-center justify-center rounded-full mb-4">
          <Terminal className="w-8 h-8" />
        </div>
        
        <h1 className="text-4xl font-mono font-bold tracking-tighter">404</h1>
        
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Route not found</h2>
          <p className="text-muted-foreground">
            The endpoint or page you requested does not exist in the current configuration.
          </p>
        </div>

        <Link href="/">
          <Button variant="default" className="font-mono gap-2 mt-4 group">
            RETURN_TO_BASE
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
