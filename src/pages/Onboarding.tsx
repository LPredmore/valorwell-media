import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useCompleteOnboarding } from "@/hooks/useProfile";
import { useCreateIdea } from "@/hooks/useIdeas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Sparkles,
  Lightbulb,
  CalendarDays,
  Send,
  Youtube,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const completeOnboarding = useCompleteOnboarding();
  const createIdea = useCreateIdea();

  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("");
  const [savingIdea, setSavingIdea] = useState(false);

  // Redirect logic
  if (!authLoading && !user) {
    navigate("/login", { replace: true });
    return null;
  }

  if (authLoading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Already onboarded — go to app
  if (profile?.onboarding_completed) {
    navigate("/schedule", { replace: true });
    return null;
  }

  const finishOnboarding = async (destination: string = "/schedule") => {
    try {
      await completeOnboarding.mutateAsync();
      navigate(destination, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not complete onboarding";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleConnectYouTube = async () => {
    await completeOnboarding.mutateAsync().catch(() => {});
    navigate("/connections");
  };

  const handleCreateIdea = async () => {
    if (!topic.trim()) {
      toast({ title: "Please enter an idea topic", variant: "destructive" });
      return;
    }
    setSavingIdea(true);
    try {
      await createIdea.mutateAsync({
        topic: topic.trim(),
        length: "Both",
      });
      toast({ title: "First idea saved!" });
      await finishOnboarding("/ideas");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save idea";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setSavingIdea(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">
            Content<span className="text-primary">Hub</span>
          </h1>
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 w-8 rounded-full transition-colors ${
                  s <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-8">
          {/* Step 1: Welcome + product tour */}
          {step === 1 && (
            <div className="space-y-8">
              <div className="space-y-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight">Welcome to ContentHub</h2>
                <p className="text-muted-foreground">
                  AI-powered scripts and social copy for your videos. Here's how it works:
                </p>
              </div>

              <div className="space-y-3">
                <FlowStep
                  icon={<Lightbulb className="h-5 w-5" />}
                  title="1. Capture ideas"
                  body="Add topics in Ideas. Bulk-import from CSV or type them in."
                />
                <FlowStep
                  icon={<Sparkles className="h-5 w-5" />}
                  title="2. Generate content"
                  body="ContentHub writes your script and platform-specific captions."
                />
                <FlowStep
                  icon={<CalendarDays className="h-5 w-5" />}
                  title="3. Schedule"
                  body="Pick a date. Upload your video. Done."
                />
                <FlowStep
                  icon={<Send className="h-5 w-5" />}
                  title="4. Auto-post"
                  body="Posts go live on YouTube and other channels automatically."
                />
              </div>

              <Button onClick={() => setStep(2)} className="w-full gap-2" size="lg">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Connect YouTube */}
          {step === 2 && (
            <div className="space-y-8">
              <div className="space-y-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Youtube className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight">Connect YouTube</h2>
                <p className="text-muted-foreground">
                  Link your YouTube channel so we can publish videos directly when you schedule them.
                  You can always add this later.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-6 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm text-foreground">Auto-publish scheduled videos to YouTube</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm text-foreground">Auto-post the first comment with hashtags</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm text-foreground">Read-only — we never post without your schedule</p>
                </div>
              </div>

              <div className="space-y-2">
                <Button onClick={handleConnectYouTube} className="w-full gap-2" size="lg">
                  <Youtube className="h-4 w-4" />
                  Connect YouTube
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  variant="ghost"
                  className="w-full"
                >
                  Skip for now
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: First idea */}
          {step === 3 && (
            <div className="space-y-8">
              <div className="space-y-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Lightbulb className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight">Your first idea</h2>
                <p className="text-muted-foreground">
                  Describe a video topic. We'll save it so you can generate the script and copy
                  with one click.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Video topic</label>
                <Textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. 5 hidden signs of burnout in veterans"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleCreateIdea}
                  disabled={savingIdea || !topic.trim()}
                  className="w-full gap-2"
                  size="lg"
                >
                  <Sparkles className="h-4 w-4" />
                  {savingIdea ? "Saving..." : "Save idea & finish"}
                </Button>
                <Button
                  onClick={() => finishOnboarding("/schedule")}
                  variant="ghost"
                  className="w-full"
                  disabled={completeOnboarding.isPending}
                >
                  Skip — I'll add ideas later
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FlowStep({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
