import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, User, Mail, Lock } from "lucide-react";
import { format } from "date-fns";

export function ProfileView() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  // Display name
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Email
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName((profile as any).display_name || "");
    }
    if (user?.email) {
      setNewEmail(user.email);
    }
  }, [profile, user]);

  const handleSaveDisplayName = async () => {
    if (!user) return;
    setSavingName(true);
    try {
      const trimmed = displayName.trim();
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ display_name: trimmed || null } as any)
        .eq("id", user.id);
      if (profileErr) throw profileErr;

      const { error: authErr } = await supabase.auth.updateUser({
        data: { display_name: trimmed || null },
      });
      if (authErr) throw authErr;

      toast({ title: "Display name updated" });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveEmail = async () => {
    const trimmed = newEmail.trim();
    if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
      toast({ title: "Invalid email", description: "Enter a valid email address.", variant: "destructive" });
      return;
    }
    if (trimmed === user?.email) {
      toast({ title: "No change", description: "That's already your email." });
      return;
    }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      toast({
        title: "Confirmation sent",
        description: `I sent a confirmation link to ${trimmed}. Click it to finish the change.`,
      });
    } catch (err: any) {
      toast({ title: "Email update failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSavePassword = async () => {
    if (!user?.email) return;
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (!currentPassword) {
      toast({ title: "Enter your current password", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      // Re-authenticate
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInErr) {
        throw new Error("Current password is incorrect");
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast({ title: "Password updated" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Password update failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage how I know you and how you sign in.
        </p>
      </div>

      {/* Account info */}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>
              Member since {format(new Date(profile.created_at), "MMM d, yyyy")}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Display name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Display name
          </CardTitle>
          <CardDescription>What I should call you in the app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveDisplayName();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="display-name">Name</Label>
              <Input
                id="display-name"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sam Carter"
                maxLength={80}
              />
            </div>
            <Button type="submit" disabled={savingName}>
              {savingName && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save name
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Email address
          </CardTitle>
          <CardDescription>
            Changing this sends a confirmation link to the new address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveEmail();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={savingEmail}>
              {savingEmail && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Update email
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            Password
          </CardTitle>
          <CardDescription>Confirm your current password to set a new one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSavePassword();
            }}
          >
            {/* Hidden username field helps password managers associate the new password with this account */}
            <input
              type="email"
              name="username"
              autoComplete="username"
              value={user?.email ?? ""}
              readOnly
              hidden
            />
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={savingPassword}>
              {savingPassword && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
