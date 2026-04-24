import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useCompleteOnboarding } from "@/hooks/useProfile";
import { useCreateIdea } from "@/hooks/useIdeas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Sparkles,
  Lightbulb,
  CalendarDays,
  Send,
  ArrowRight,
  ArrowLeft,
  MessageSquareText,
} from "lucide-react";
import mascot from "@/assets/flurra-mascot.png";
import { OnboardingLogoutButton } from "@/components/OnboardingLogoutButton";
import { PAYMENTS_ENABLED } from "@/lib/featureFlags";

const CHANNEL_BRIEF_SCOPE = "channel_brief";
const POST_ONBOARDING_PATH = PAYMENTS_ENABLED ? "/onboarding/subscribe" : "/schedule";

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const completeOnboarding = useCompleteOnboarding();
  const createIdea = useCreateIdea();

  const [step, setStep] = useState(1);
  const [channelBrief, setChannelBrief] = useState("");
  const [savingBrief, setSavingBrief] = useState(false);
  const [topic, setTopic] = useState("");
  const [savingIdea, setSavingIdea] = useState(false);

  // Hydrate any existing channel brief
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_content_instructions")
        .select("instruction")
        .eq("user_id", user.id)
        .eq("scope", CHANNEL_BRIEF_SCOPE)
        .maybeSingle();
      if (data?.instruction) setChannelBrief(data.instruction);
    })();
  }, [user]);

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

  // Already onboarded — go to subscribe (gating happens there) or straight to app if payments are off
  if (profile?.onboarding_completed) {
    navigate(POST_ONBOARDING_PATH, { replace: true });
    return null;
  }

  const saveChannelBrief = async (): Promise<boolean> => {
    if (!user) return false;
    setSavingBrief(true);
    try {
      const { error } = await supabase
        .from("user_content_instructions")
        .upsert(
          {
            user_id: user.id,
            scope: CHANNEL_BRIEF_SCOPE,
            instruction: channelBrief.trim() || "(No channel description provided yet.)",
            is_active: true,
          },
          { onConflict: "user_id,scope" },
        );
      if (error) throw error;
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save your channel brief";
      toast({ title: "Error", description: msg, variant: "destructive" });
      return false;
    } finally {
      setSavingBrief(false);
    }
  };

  const handleStep2Continue = async () => {
    if (!channelBrief.trim()) {
      toast({
        title: "Tell me a little about your channel",
        description: "Even a sentence or two helps me write better for you.",
        variant: "destructive",
      });
      return;
    }
    const ok = await saveChannelBrief();
    if (ok) setStep(3);
  };

  const finishOnboarding = async (destination = POST_ONBOARDING_PATH) => {
    try {
      await completeOnboarding.mutateAsync();
      navigate(destination, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not complete onboarding";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleCreateIdea = async () => {
    if (!topic.trim()) {
      toast({ title: "Please enter an idea topic", variant: "destructive" });
      return;
    }
    setSavingIdea(true);
    try {
      await createIdea.mutateAsync({ topic: topic.trim(), length: "Both" });
      toast({ title: "First idea saved!" });
      await finishOnboarding();
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
          <div className="flex items-center gap-3">
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
            <OnboardingLogoutButton />
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
                  body="When the time comes, I push it live to all 10 of your channels."
                />
              </div>

              <Button onClick={() => setStep(2)} className="w-full gap-2" size="lg">
                Let's go
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Channel brief */}
          {step === 2 && (
            <div className="space-y-8">
              <div className="space-y-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                  <MessageSquareText className="h-6 w-6 text-primary" />
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight">
                  Tell me about your channel
                </h2>
                <p className="text-muted-foreground">
                  The more I know about your channel, the better the ideas and scripts I'll write
                  for you. Paste in anything that helps me get the vibe — your About page, brand
                  guidelines, past video descriptions, whatever you've got.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Channel brief</label>
                <Textarea
                  value={channelBrief}
                  onChange={(e) => setChannelBrief(e.target.value)}
                  rows={12}
                  placeholder={`Try covering:
• What your channel/business is about
• Who it's for (your audience)
• Tone, voice, and style
• Topics you cover, things you avoid
• Catchphrases, taglines, recurring formats`}
                  className="resize-y"
                />
                <p className="text-xs text-muted-foreground">
                  You can come back and edit this anytime in Settings → Instructions.
                </p>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleStep2Continue}
                  disabled={savingBrief}
                  className="w-full gap-2"
                  size="lg"
                >
                  {savingBrief ? "Saving…" : "Continue"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => setStep(1)}
                  variant="ghost"
                  className="w-full gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
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
                  onClick={() => finishOnboarding()}
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
