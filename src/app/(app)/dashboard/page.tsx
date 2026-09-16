import Image from "next/image";
import Link from "next/link";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Clock3,
  MoreVertical,
  Search,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Metric } from "@/components/metric";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db";
import {
  applicationSettings,
  assetMetadata,
  assetReviews,
  commercialBriefs,
  generatedAssets,
  generationJobs,
  opportunities,
  upscaleJobs,
} from "@/db/schema";
import { formatIdr } from "@/lib/utils";
import { formatAppDateTime } from "@/lib/format/date";

export const dynamic = "force-dynamic";

type RecentJob = {
  id: string;
  briefName: string;
  prompt: string;
  provider: string;
  model: string;
  status: string;
  createdAt: Date;
  cost: string | null;
  storageKey: string | null;
};

function assetUrl(storageKey: string) {
  return `/api/assets/${storageKey.split("/").map(encodeURIComponent).join("/")}?width=640`;
}

export default async function DashboardPage() {
  let metrics = {
    opportunities: 0,
    readyBriefs: 0,
    generatedImages: 0,
    exportReady: 0,
    awaitingReview: 0,
  };
  let recentJobs: RecentJob[] = [];
  let recentImages: Array<{
    id: string;
    storageKey: string;
    briefName: string;
  }> = [];
  let budget = {
    spentIdr: 0,
    limitIdr: 500_000,
    usdToIdr: 16_250,
    generationIdr: 0,
    upscalingIdr: 0,
  };

  if (process.env.DATABASE_URL) {
    const db = getDb();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [
      opportunityCount,
      briefCount,
      assetCount,
      reviewCount,
      exportCount,
      settings,
      generationSpend,
      upscaleSpend,
      jobs,
      images,
    ] = await Promise.all([
      db.select({ value: count() }).from(opportunities),
      db
        .select({ value: count() })
        .from(commercialBriefs)
        .where(eq(commercialBriefs.status, "ready")),
      db.select({ value: count() }).from(generatedAssets),
      db
        .select({ value: count() })
        .from(assetReviews)
        .where(eq(assetReviews.decision, "pending")),
      db
        .select({ value: sql<number>`count(distinct ${generatedAssets.id})` })
        .from(generatedAssets)
        .innerJoin(
          assetReviews,
          eq(assetReviews.generatedAssetId, generatedAssets.id),
        )
        .innerJoin(
          assetMetadata,
          eq(assetMetadata.generatedAssetId, generatedAssets.id),
        )
        .where(
          and(
            eq(assetReviews.decision, "approved"),
            gte(generatedAssets.megapixels, "4"),
          ),
        ),
      db.select().from(applicationSettings).limit(1),
      db
        .select({
          value: sql<string>`coalesce(sum(coalesce(${generationJobs.actualCostUsd}, ${generationJobs.estimatedCostUsd})), 0)`,
        })
        .from(generationJobs)
        .where(gte(generationJobs.createdAt, monthStart)),
      db
        .select({
          value: sql<string>`coalesce(sum(coalesce(${upscaleJobs.actualCostUsd}, ${upscaleJobs.estimatedCostUsd})), 0)`,
        })
        .from(upscaleJobs)
        .where(gte(upscaleJobs.createdAt, monthStart)),
      db
        .select({
          id: generationJobs.id,
          briefName: commercialBriefs.name,
          prompt: generationJobs.prompt,
          provider: generationJobs.provider,
          model: generationJobs.model,
          status: generationJobs.status,
          createdAt: generationJobs.createdAt,
          cost: generationJobs.actualCostUsd,
          storageKey: generatedAssets.storageKey,
        })
        .from(generationJobs)
        .innerJoin(
          commercialBriefs,
          eq(commercialBriefs.id, generationJobs.briefId),
        )
        .leftJoin(
          generatedAssets,
          eq(generatedAssets.generationJobId, generationJobs.id),
        )
        .orderBy(desc(generationJobs.createdAt))
        .limit(5),
      db
        .select({
          id: generatedAssets.id,
          storageKey: generatedAssets.storageKey,
          briefName: commercialBriefs.name,
        })
        .from(generatedAssets)
        .innerJoin(
          generationJobs,
          eq(generationJobs.id, generatedAssets.generationJobId),
        )
        .innerJoin(
          commercialBriefs,
          eq(commercialBriefs.id, generationJobs.briefId),
        )
        .orderBy(desc(generatedAssets.createdAt))
        .limit(4),
    ]);
    metrics = {
      opportunities: opportunityCount[0].value,
      readyBriefs: briefCount[0].value,
      generatedImages: assetCount[0].value,
      awaitingReview: reviewCount[0].value,
      exportReady: Number(exportCount[0].value),
    };
    recentJobs = jobs;
    recentImages = images;
    const usdToIdr = Number(settings[0]?.usdToIdr ?? 16_250);
    const generationIdr = Number(generationSpend[0].value) * usdToIdr;
    const upscalingIdr = Number(upscaleSpend[0].value) * usdToIdr;
    budget = {
      spentIdr: generationIdr + upscalingIdr,
      limitIdr: settings[0]?.monthlyBudgetIdr ?? 500_000,
      usdToIdr,
      generationIdr,
      upscalingIdr,
    };
  }

  const budgetPercent = budget.limitIdr
    ? Math.min(100, Math.round((budget.spentIdr / budget.limitIdr) * 100))
    : 0;
  return (
    <>
      <PageHeader
        title="Creative production"
        description="Move research into submission-ready image packs."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/opportunities">
                <Search />
                Research topics
              </Link>
            </Button>
            <Button asChild>
              <Link href="/briefs">
                <Sparkles />
                Create brief
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Opportunities"
          value={String(metrics.opportunities)}
          note="Saved research topics"
          icon={Search}
        />
        <Metric
          label="Briefs ready"
          value={String(metrics.readyBriefs)}
          note="Ready to generate"
          icon={BookOpenText}
        />
        <Metric
          label="Awaiting review"
          value={String(metrics.awaitingReview)}
          note="Needs your decision"
          icon={Clock3}
        />
        <Metric
          label="Ready to export"
          value={String(metrics.exportReady)}
          note="Ready for Adobe"
          icon={CheckCircle2}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.65fr_.6fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Production pipeline</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                From research to Adobe-ready packages.
              </p>
            </div>
            <span className="control-raised rounded-lg border bg-card px-3 py-2 text-xs">
              This month
            </span>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-5 sm:grid-cols-4">
              {[
                {
                  label: "Research",
                  value: metrics.opportunities,
                  detail: "Opportunities",
                  icon: Search,
                },
                {
                  label: "Briefs",
                  value: metrics.readyBriefs,
                  detail: "Ready to generate",
                  icon: BookOpenText,
                },
                {
                  label: "Generation",
                  value: metrics.generatedImages,
                  detail: "Images created",
                  icon: Sparkles,
                },
                {
                  label: "Export ready",
                  value: metrics.exportReady,
                  detail: "Ready for Adobe",
                  icon: CheckCircle2,
                },
              ].map((item, index) => (
                <div key={item.label} className="relative text-center">
                  <div className="control-raised mx-auto grid size-12 place-items-center rounded-full border bg-emerald-50 text-emerald-700">
                    <item.icon className="size-5" />
                  </div>
                  {index < 3 && (
                    <span className="absolute left-[calc(50%+34px)] top-5 hidden h-2 w-[calc(100%-68px)] rounded-full bg-gradient-to-r from-emerald-700 to-emerald-300 sm:block" />
                  )}
                  <p className="mt-3 text-xs font-semibold">{item.label}</p>
                  <p className="mt-1 font-mono text-xl font-semibold">
                    {item.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Monthly budget</CardTitle>
            <span className="text-xs text-muted-foreground">This month</span>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <p className="text-lg font-semibold">
                {formatIdr(Math.round(budget.spentIdr))}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  of {formatIdr(budget.limitIdr)}
                </span>
              </p>
              <b className="text-emerald-700">{budgetPercent}%</b>
            </div>
            <Progress value={budgetPercent} className="mt-4" />
            <div className="mt-4 space-y-3 border-t pt-4 text-xs">
              <div className="flex justify-between">
                <span>Image generation</span>
                <span className="text-muted-foreground">
                  {formatIdr(Math.round(budget.generationIdr))}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Upscaling</span>
                <span className="text-muted-foreground">
                  {formatIdr(Math.round(budget.upscalingIdr))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_.65fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between border-b py-3">
            <CardTitle>Recent generations</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/generation?tab=history">
                View all <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="workspace-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Brief name</TableHead>
                  <TableHead>Prompt / Theme</TableHead>
                  <TableHead>Provider / Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentJobs.map((job, index) => (
                  <TableRow key={`${job.id}-${index}`}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      {job.storageKey ? (
                        <Image
                          src={assetUrl(job.storageKey)}
                          alt=""
                          width={44}
                          height={36}
                          unoptimized
                          className="h-9 w-11 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="grid h-9 w-11 place-items-center rounded-lg bg-muted">
                          <Sparkles className="size-4 text-muted-foreground" />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {job.briefName}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">
                      {job.prompt}
                    </TableCell>
                    <TableCell>
                      <span>{job.provider}</span>
                      <p className="text-[10px] text-muted-foreground">
                        {job.model}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          job.status === "succeeded"
                            ? "success"
                            : job.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {job.status === "succeeded" ? "Completed" : job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatAppDateTime(job.createdAt)}
                    </TableCell>
                    <TableCell>
                      {job.cost ? `$${Number(job.cost).toFixed(3)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <MoreVertical className="size-4" />
                    </TableCell>
                  </TableRow>
                ))}
                {!recentJobs.length && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No generations yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between border-b py-3">
            <CardTitle>Recent image results</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/review">
                View all <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 p-3">
            {recentImages.map((asset) => (
              <Link
                href={`/review?imageId=${asset.id}`}
                key={asset.id}
                className="group relative aspect-square overflow-hidden rounded-xl bg-muted"
              >
                <Image
                  src={assetUrl(asset.storageKey)}
                  alt={asset.briefName}
                  fill
                  unoptimized
                  className="object-cover transition-transform group-hover:scale-[1.03]"
                />
              </Link>
            ))}
            {!recentImages.length && (
              <div className="col-span-2 grid min-h-48 place-items-center text-sm text-muted-foreground">
                No image results yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
