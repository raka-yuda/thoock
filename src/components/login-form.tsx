"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { toast } from "./ui/toaster";
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: form.get("password"),
      }),
    });
    const value = await response.json();
    if (!response.ok) {
      const message = value.error ?? "Sign-in failed.";
      setError(message);
      toast({
        title: "Sign-in failed",
        description: message,
        variant: "error",
      });
      setLoading(false);
      return;
    }
    toast({
      title: "Signed in",
      description: "Welcome back to your private production workspace.",
      variant: "success",
    });
    router.replace("/dashboard");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={12}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-3 text-sm text-muted-foreground">
        <Checkbox name="remember" defaultChecked aria-label="Keep me signed in" />
        Keep me signed in
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button className="w-full" type="submit" disabled={loading}>
        {loading ? (
          "Signing in"
        ) : (
          <>
            Sign in <ArrowRight />
          </>
        )}
      </Button>
    </form>
  );
}
