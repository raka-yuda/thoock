"use client";

import { useState } from "react";
import { Boxes, CheckCircle2, Database, FolderLock, Info, KeyRound, Save, Settings2, ShieldCheck, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Progress } from "./ui/progress";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { toast } from "./ui/toaster";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

type SettingsSection = "general" | "security" | "providers" | "models" | "storage" | "budget";

const navigation = [
  { id: "general", label: "General", detail: "Workspace and preferences", icon: Settings2, aria: "Cost controls" },
  { id: "security", label: "Security", detail: "Access and authentication", icon: ShieldCheck, aria: "Security and storage" },
  { id: "providers", label: "Providers", detail: "AI and external services", icon: KeyRound },
  { id: "models", label: "Model catalog", detail: "Available image models", icon: Boxes },
  { id: "storage", label: "Storage", detail: "Files and local storage", icon: Database },
  { id: "budget", label: "Budget and compliance", detail: "Limits and usage policies", icon: WalletCards },
] as const;

function initialSection(tab: "cost" | "providers" | "compliance" | "security"): SettingsSection {
  if (tab === "providers") return "providers";
  if (tab === "security") return "security";
  if (tab === "compliance") return "budget";
  return "general";
}

export function SettingsWorkspace({ initialTab = "cost", snapgenConfigured = false, openAIConfigured = false, mockMode = true }: { initialTab?: "cost" | "providers" | "compliance" | "security"; snapgenConfigured?: boolean; openAIConfigured?: boolean; mockMode?: boolean }) {
  const [section, setSection] = useState<SettingsSection>(initialSection(initialTab));
  function selectSection(next: SettingsSection) {
    setSection(next);
    const tab = next === "general" ? "cost" : next === "budget" ? "compliance" : next === "models" ? "providers" : next === "storage" ? "security" : next;
    window.history.replaceState(null, "", `/settings?tab=${tab}`);
  }
  return (
    <TooltipProvider delayDuration={180}>
      <PageHeader title="Settings" description="Configure this private production workspace." />
      <div className="grid gap-4 lg:grid-cols-[276px_minmax(0,1fr)]">
        <nav className="workspace-panel grid grid-cols-1 gap-2 self-start p-3" aria-label="Settings sections" role="tablist" aria-orientation="vertical">
          {navigation.map((item) => {
            const active = section === item.id;
            return (
              <button key={item.id} type="button" role="tab" aria-label={("aria" in item && item.aria) || item.label} aria-selected={active} data-state={active ? "active" : "inactive"} onClick={() => selectSection(item.id)} className={cn("group relative flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left outline-none transition-[background-color,border-color,box-shadow,transform] duration-200 hover:translate-x-0.5 hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring", active && "hover:translate-0 control-raised border-emerald-700/15 bg-emerald-50/80")}>
                {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-emerald-600" />}
                <item.icon className={cn("size-5 shrink-0 text-[#22345b]", active && "text-emerald-700")} />
                <span className="min-w-0"><span className={cn("block text-sm font-semibold", active && "text-emerald-950")}>{item.label}</span><span className="block truncate text-[11px] text-muted-foreground">{item.detail}</span></span>
              </button>
            );
          })}
        </nav>
        <section className="workspace-panel min-h-[680px] p-5 sm:p-6" role="tabpanel">
          {section === "general" && <GeneralSettings mockMode={mockMode} />}
          {section === "security" && <SecuritySettings />}
          {section === "providers" && <ProviderSettings snapgenConfigured={snapgenConfigured} openAIConfigured={openAIConfigured} mockMode={mockMode} />}
          {section === "models" && <ModelSettings />}
          {section === "storage" && <StorageSettings />}
          {section === "budget" && <BudgetComplianceSettings />}
        </section>
      </div>
    </TooltipProvider>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return <div className="mb-6 border-b pb-5"><h2 className="text-xl font-semibold tracking-[-.025em]">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}

function GeneralSettings({ mockMode }: { mockMode: boolean }) {
  function explainServerManagedSettings() {
    toast({
      title: "Settings were not saved",
      description:
        "This editor currently mirrors server configuration. Update the VPS environment or database configuration, then restart Thoock to apply changes.",
      variant: "warning",
    });
  }

  return (
    <div>
      <SectionHeading title="General settings" description="Basic information and production preferences." />
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Workspace name" info="Used throughout the private interface."><Input defaultValue="Thoock" /></Field>
        <Field label="Default region" info="Used as the starting region for new research."><Input defaultValue="Indonesia" /></Field>
        <div className="flex min-h-20 items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4"><div><InfoLabel label="Mock mode" info="Controlled by MOCK_MODE in the server environment." /><p className="mt-1 text-xs text-muted-foreground">{mockMode ? "Mock providers are preferred by default." : "Configured live providers are preferred by default."}</p></div><Switch checked={mockMode} disabled aria-label="Mock mode" /></div>
        <Field label="Adobe minimum resolution" info="Export is blocked below this inspected resolution."><UnitInput defaultValue="4" unit="MP" /></Field>
        <Field label="Image preparation target" info="Small safety margin used for processing."><UnitInput defaultValue="4.2" unit="MP" /></Field>
      </div>
      <div id="budget" className="mt-7 scroll-mt-24 border-t pt-6">
        <h3 className="text-lg font-semibold">Monthly spending limit</h3><p className="mt-1 text-sm text-muted-foreground">One ceiling covers generation and paid upscaling.</p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="control-inset rounded-xl border bg-muted/25 p-4"><div className="flex items-end justify-between"><p><b className="text-lg">Rp 310.000</b> <span className="text-sm text-muted-foreground">of Rp 500.000</span></p><b className="text-emerald-700">62%</b></div><Progress value={62} className="mt-3" /></div>
          <Field label="USD / IDR rate" info="Used only for cost estimation and display."><UnitInput defaultValue="16,000" unit="IDR" /></Field>
          <Field label="Monthly candidate image limit" info="Maximum candidate outputs per month."><UnitInput defaultValue="1,000" unit="images" /></Field>
          <Field label="Local storage path" info="Server-controlled path; browser input cannot access arbitrary files."><Input defaultValue="/Volumes/Thoock/Generations" /></Field>
        </div>
      </div>
      <div className="mt-7 flex justify-end"><Button onClick={explainServerManagedSettings}><Save /> Save changes</Button></div>
    </div>
  );
}

function SecuritySettings() {
  return <div id="storage" className="scroll-mt-24"><SectionHeading title="Security and storage" description="Single-user access and protected local data." /><div className="grid gap-4 md:grid-cols-2"><Status icon={ShieldCheck} title="Password session" detail="HTTP-only, signed, same-site cookie" /><Status icon={FolderLock} title="Private provider credentials" detail="Server-side only and never returned to the browser" /><Status icon={Database} title="Storage and database" detail="PostgreSQL workflow records with guarded storage keys" /><Status icon={CheckCircle2} title="No public registration" detail="The initial owner is created through controlled setup" /></div></div>;
}

function ProviderSettings({ snapgenConfigured, openAIConfigured, mockMode }: { snapgenConfigured: boolean; openAIConfigured: boolean; mockMode: boolean }) {
  return <div><SectionHeading title="Providers" description="Server-side image generation and processing connections." /><div className="grid gap-4 xl:grid-cols-2"><ProviderCard name="Mock studio" status={mockMode ? "Default" : "Available"} description="Free local development outputs and imported-image normalization." fields={[`MOCK_MODE=${mockMode}`]} /><ProviderCard name="OpenAI" status={openAIConfigured ? "Active" : "Not configured"} description="Topic research, bulk commercial briefs, prompt writing, and Adobe metadata drafts." fields={["OPENAI_API_KEY", "OPENAI_TEXT_MODEL", "OPENAI_RESEARCH_MODEL"]} /><ProviderCard name="SnapGenAI" status={snapgenConfigured ? "Active" : "Not configured"} description="Catalog-driven Nano, Grok, and GPT image routes with history recovery." fields={["SNAPGEN_API_BASE_URL", "SNAPGEN_API_KEY"]} /><ProviderCard name="Cloudflare Workers AI" status="Optional" description="Owner-controlled endpoint returning image bytes for local inspection." fields={["CLOUDFLARE_WORKER_AI_URL", "CLOUDFLARE_WORKER_AI_API_KEY"]} /><ProviderCard name="Local AI upscale" status="Disabled by default" description="Controlled local HTTP worker or predefined executable arguments." fields={["LOCAL_UPSCALE_ENABLED=false", "LOCAL_UPSCALE_URL"]} /></div></div>;
}

function ModelSettings() {
  return <div><SectionHeading title="Model catalog" description="Keep availability, capabilities, pricing, and terms configurable." /><Alert><Boxes /><AlertTitle>Snapshot-based configuration</AlertTitle><AlertDescription>Every generation job stores the model capability and pricing snapshot used at request time, so later catalog changes do not rewrite historical costs.</AlertDescription></Alert><div className="mt-5"><Field label="Optional JSON catalog override" info="Server-side capability overrides for models that change frequently."><Textarea className="min-h-56 font-mono text-xs" placeholder="GENERATION_MODEL_CATALOG_JSON=[...]" /></Field></div></div>;
}

function StorageSettings() {
  return <div><SectionHeading title="Storage" description="Preserve originals and derived files separately." /><div className="grid gap-4 md:grid-cols-2"><Status icon={Database} title="PostgreSQL" detail="Workflow, cost, configuration, and request records" /><Status icon={FolderLock} title="Local asset storage" detail="Guarded relative keys with an S3-compatible adapter seam" /></div><Alert className="mt-5"><Info /><AlertTitle>Originals are immutable</AlertTitle><AlertDescription>Upscaled and prepared files are stored as derived assets and retain a reference to their source.</AlertDescription></Alert></div>;
}

function BudgetComplianceSettings() {
  function explainServerManagedSettings() {
    toast({
      title: "Settings were not saved",
      description:
        "Budget and compliance controls are currently server-managed. Update the persisted application configuration before relying on changed values.",
      variant: "warning",
    });
  }

  return <div><SectionHeading title="Budget and compliance" description="Enforce cost boundaries and Adobe-oriented preparation gates." /><div className="grid gap-5 md:grid-cols-2"><Field label="Monthly limit (IDR)"><Input type="number" defaultValue={500000} /></Field><Field label="Candidate-count limit"><Input type="number" defaultValue={6} /></Field></div><div className="mt-5 space-y-3"><Setting label="Warn at 80%" detail="Warn before the budget is exhausted" checked /><Setting label="Hard stop at 100%" detail="Block paid requests unless explicitly overridden" checked /><Setting label="Require post-upscale review" detail="Every enlarged result returns to human review" checked /><Setting label="Allow Creative Upscale" detail="Disabled because it may reinterpret source detail" /></div><div className="mt-5"><Field label="Prohibited terms, one per line" info="A configurable advisory metadata and prompt safety list."><Textarea className="min-h-44 font-mono text-xs" defaultValue={"generative ai\n--ar\n--stylize\ndisney\nmarvel\nstar wars\nharry potter\npokemon"} /></Field></div><div className="mt-6 flex justify-end"><Button onClick={explainServerManagedSettings}><Save /> Save changes</Button></div></div>;
}

function InfoLabel({ label, info }: { label: string; info?: string }) {
  return <span className="flex items-center gap-1.5 text-sm font-medium">{label}{info && <Tooltip><TooltipTrigger asChild><button type="button" aria-label={`About ${label}`} className="rounded-full text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"><Info className="size-3.5" /></button></TooltipTrigger><TooltipContent className="max-w-64">{info}</TooltipContent></Tooltip>}</span>;
}
function Field({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label asChild><InfoLabel label={label} info={info} /></Label>{children}</div>; }
function UnitInput({ defaultValue, unit }: { defaultValue: string; unit: string }) { return <div className="control-inset flex overflow-hidden rounded-xl border bg-card"><Input defaultValue={defaultValue} className="border-0 shadow-none focus-visible:ring-0" /><span className="grid min-w-16 place-items-center border-l bg-muted/65 px-3 text-xs text-muted-foreground">{unit}</span></div>; }
function Setting({ label, detail, checked }: { label: string; detail: string; checked?: boolean }) { return <div className="flex items-start justify-between gap-4 rounded-xl border bg-muted/15 p-3.5"><div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><Switch defaultChecked={checked} aria-label={label} /></div>; }
function ProviderCard({ name, status, description, fields }: { name: string; status: string; description: string; fields: string[] }) { return <Card><CardHeader><div className="flex items-center justify-between"><span className="control-raised grid size-9 place-items-center rounded-lg border bg-muted"><KeyRound className="size-4" /></span><Badge variant={["Active", "Default"].includes(status) ? "success" : "secondary"}>{status}</Badge></div><CardTitle className="pt-2">{name}</CardTitle><p className="text-sm text-muted-foreground">{description}</p></CardHeader><CardContent><div className="control-inset rounded-lg border bg-muted/50 p-3 font-mono text-[11px] text-muted-foreground">{fields.map((field) => <p key={field}>{field}</p>)}</div></CardContent></Card>; }
function Status({ icon: Icon, title, detail }: { icon: typeof Database; title: string; detail: string }) { return <div className="surface-raised flex items-center gap-3 rounded-xl border bg-card p-4"><span className="control-raised grid size-10 place-items-center rounded-xl border bg-emerald-50 text-emerald-700"><Icon className="size-4" /></span><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></div></div>; }
