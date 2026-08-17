import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, Lock, Mail, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function BrevoOnboarding() {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const handleValidate = async () => {
    if (!apiKey) {
      toast.error("Please enter your API key");
      return;
    }

    setIsValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-brevo-key", {
        body: { apiKey },
      });

      if (error) throw error;

      const validation = data as { valid?: boolean } | null;
      if (!validation?.valid) {
        toast.error("Invalid API key. Please check and try again.");
        return;
      }

      setStep(4);
      toast.success("Brevo connected successfully!");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unable to validate the Brevo API key.";
      toast.error(message);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Card className="mx-auto max-w-2xl border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-lg">
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-2xl">Connect Brevo</CardTitle>
            <CardDescription>
              Power your email campaigns with the world&apos;s most popular SMTP provider.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <div className="mb-8 flex items-center justify-between">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold",
                  step === s
                    ? "border-primary bg-primary text-white"
                    : step > s
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900",
                )}
              >
                {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={cn(
                    "mx-2 h-[2px] w-12 sm:w-24",
                    step > s ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800",
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="animate-in slide-in-from-right-4 space-y-4 fade-in duration-300">
            <h3 className="text-lg font-semibold">Step 1: Create Brevo Account</h3>
            <p className="text-slate-600 dark:text-slate-400">
              If you don&apos;t have a Brevo account yet, you&apos;ll need to create one. It&apos;s
              free and takes 2 minutes.
            </p>
            <Button className="w-full sm:w-auto" asChild>
              <a href="https://brevo.com" target="_blank" rel="noopener noreferrer">
                Create Brevo Account
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <div className="flex justify-end pt-4">
              <Button onClick={() => setStep(2)}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in slide-in-from-right-4 space-y-4 fade-in duration-300">
            <h3 className="text-lg font-semibold">Step 2: Generate API Key</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Go to your Brevo settings and generate a new API v3 key.
            </p>
            <Button variant="outline" className="w-full sm:w-auto" asChild>
              <a
                href="https://app.brevo.com/settings/keys/api"
                target="_blank"
                rel="noopener noreferrer"
              >
                Go to API Settings
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in slide-in-from-right-4 space-y-4 fade-in duration-300">
            <h3 className="text-lg font-semibold">Step 3: Paste API Key</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Paste your API key here to securely connect your account.
            </p>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="password"
                placeholder="xkeysib-..."
                className="pl-10"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={handleValidate} disabled={isValidating}>
                {isValidating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    Connect Brevo
                    <Zap className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="animate-in zoom-in-95 flex flex-col items-center justify-center space-y-4 py-8 duration-500">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/20">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold">Successfully Connected!</h3>
            <p className="text-center text-slate-600 dark:text-slate-400">
              Your Brevo account is now linked to OfficeKonnect. You can start sending campaigns.
            </p>
            <Button className="mt-4" asChild>
              <Link to="/dashboard/mail">Go to Mail Center</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
