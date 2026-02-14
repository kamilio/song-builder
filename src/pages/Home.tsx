import { Button } from "@/components/ui/button";
import { Music } from "lucide-react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <div className="flex items-center gap-3">
        <Music className="h-10 w-10" />
        <h1 className="text-4xl font-bold">Song Builder</h1>
      </div>
      <p className="text-muted-foreground text-lg text-center max-w-md">
        Generate song lyrics with Claude and create audio with ElevenLabs.
      </p>
      <div className="flex gap-4">
        <Button asChild>
          <Link to="/lyrics">Get Started</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
      </div>
    </div>
  );
}
