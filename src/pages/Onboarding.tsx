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
import mascot from "@/assets/flurra-mascot.png";

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

  const finishOnboarding = async (destination: string = "/connections") => {
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
      await finishOnboarding("/connections");
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
          <div className="flex items-center -my-6">
            <img
              src={mascot}
              alt="Flurra"
              className="h-[13rem] w-auto object-contain"
            />
          </div>
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

        <div className="flex-1 space-y-8 animate-fade-in-up">
          {/* Step 1: Welcome + product tour */}
          {step === 1 && (
            <div className="space-y-8">
              <div className="space-y-4">
                <h2 className="font-display text-4xl font-bold tracking-tight text-brand-gradient">
                  Hi, I'm Flurra
                </h2>
                <p className="text-muted-foreground">
                  Think of me as your content teammate. Here's how I help:
                </p>
              </div>

              <div className="space-y-3">
                <FlowStep
                  icon={<Lightbulb className="h-5 w-5" />}
                  title="You bring the ideas"
                  body="Drop topics in Ideas — type them in or bulk-import a CSV."
                />
                <FlowStep
                  icon={<Sparkles className="h-5 w-5" />}
                  title="I'll write the scripts"
                  body="Long-form scripts plus platform-specific captions, ready to review."
                />
                <FlowStep
                  icon={<CalendarDays className="h-5 w-5" />}
                  title="I'll handle the calendar"
                  body="You pick the date, drop the video, and I queue it up."
                />
                <FlowStep
                  icon={<Send className="h-5 w-5" />}
                  title="I'll publish for you"
                  body="When the time comes, I push it live to YouTube and your channels."
                />
              </div>

              <Button onClick={() => setStep(2)} className="w-full gap-2" size="lg">
                Let's go
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Connect YouTube */}
          {step === 2 && (
            <div className="space-y-8">
              <div className="space-y-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                  <Youtube className="h-6 w-6 text-primary" />
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight">Hook me up to YouTube</h2>
                <p className="text-muted-foreground">
                  Link your channel so I can publish videos for you when they're scheduled.
                  Totally fine to do this later.
                </p>
              </div>

              <div className="rounded-2xl border border-border surface-elevated p-6 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm text-foreground">I'll auto-publish your scheduled videos</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm text-foreground">I'll drop the first comment with your hashtags</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm text-foreground">I never post anything without your schedule</p>
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
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                  <Lightbulb className="h-6 w-6 text-primary" />
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight">What's on your mind?</h2>
                <p className="text-muted-foreground">
                  Toss me a video topic and I'll save it. You can generate the full script and
                  social copy with one click later.
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
                  onClick={() => finishOnboarding("/connections")}
                  variant="ghost"
                  className="w-full"
                  disabled={completeOnboarding.isPending}
                >
                  I'll add ideas later
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
    <div className="flex gap-4 rounded-2xl border border-border surface-elevated p-4 transition-colors hover:border-primary/40">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        {icon}
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
