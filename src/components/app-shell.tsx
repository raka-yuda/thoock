"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  Aperture,
  BookOpenText,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Images,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings2,
  ScrollText,
  Sun,
  WalletCards,
  WandSparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SidebarTooltipContent,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navGroups = [
  {
    label: "",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Research",
    items: [{ href: "/opportunities", label: "Opportunities", icon: Search }],
  },
  {
    label: "Production",
    items: [
      { href: "/briefs", label: "Commercial briefs", icon: BookOpenText },
      { href: "/generation", label: "Image generation", icon: WandSparkles },
      { href: "/review", label: "Review queue", icon: Images },
    ],
  },
  {
    label: "Delivery",
    items: [{ href: "/exports", label: "Adobe exports", icon: Download }],
  },
  {
    label: "System",
    items: [
      { href: "/provider-logs", label: "Provider logs", icon: ScrollText },
      { href: "/settings", label: "Settings", icon: Settings2 },
    ],
  },
];

export function AppShell({
  children,
  ownerEmail,
}: {
  children: React.ReactNode;
  ownerEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const { resolvedTheme, setTheme } = useTheme();
  const ownerInitials =
    ownerEmail
      .split("@")[0]
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "OW";
  const commandItems = useMemo(
    () =>
      navGroups
        .flatMap((group) => group.items)
        .filter((item) =>
          item.label.toLowerCase().includes(commandQuery.trim().toLowerCase()),
        ),
    [commandQuery],
  );

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  async function signOut() {
    setSigningOut(true);
    setAccountError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok)
        throw new Error("The server could not end the session.");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Could not sign out.",
      );
      setSigningOut(false);
    }
  }
  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-[100dvh] bg-background">
        {mobileOpen && (
          <Button
            type="button"
            variant="ghost"
            className="fixed inset-0 z-[5] h-auto w-auto rounded-none bg-foreground/35 p-0 hover:bg-foreground/35 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation overlay"
          />
        )}
        <aside
          id="app-sidebar"
          aria-label="Primary sidebar"
          className={cn(
            "sidebar-shell fixed inset-y-0 left-0 z-10 flex flex-col backdrop-blur-xl transition-[width,transform] duration-300 ease-out",
            collapsed ? "w-[72px]" : "w-64",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div
            className={cn(
              "sidebar-brand flex h-[70px] items-center gap-3 px-7",
              collapsed && "justify-center px-0",
            )}
          >
            <span className="sidebar-brand-mark grid size-8 shrink-0 place-items-center rounded-full bg-[#08754f] text-white">
              <Aperture className="size-6" strokeWidth={2} />
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[1.4rem] font-bold tracking-[-0.045em]">
                  Thoock
                </p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X />
            </Button>
          </div>
          <nav
            className={cn(
              "flex-1 overflow-y-auto pb-5 pt-4",
              collapsed ? "px-3.5" : "px-4",
            )}
            aria-label="Application navigation"
          >
            {navGroups.map((group, groupIndex) => (
              <div key={group.label} className={cn(groupIndex > 0 && "mt-6")}>
                {!collapsed && group.label && (
                  <p className="sidebar-group-label mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active =
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                    const link = (
                      <Link
                        href={item.href}
                        data-active={active}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "sidebar-nav-item group flex h-[var(--control-height-large)] items-center gap-3 px-3.5 text-sm font-medium outline-none transition-[color,background-color,border-color,box-shadow,filter,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring",
                          active && "font-semibold",
                          collapsed && "justify-center px-0",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "size-5 shrink-0 transition-transform duration-200 group-hover:scale-[1.04]",
                            active && "text-primary",
                          )}
                          strokeWidth={1.9}
                        />
                        {!collapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </Link>
                    );
                    return collapsed ? (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <SidebarTooltipContent
                          side="right"
                        >
                          {item.label}
                        </SidebarTooltipContent>
                      </Tooltip>
                    ) : (
                      <div key={item.href}>{link}</div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
        <div
          className={cn(
            "transition-[padding] duration-200",
            collapsed ? "lg:pl-[72px]" : "lg:pl-64",
          )}
        >
          <header className="sticky top-0 z-[4] flex h-[70px] items-center border-b bg-background/92 px-4 shadow-[0_8px_24px_-26px_var(--control-shadow-strong)] backdrop-blur-xl md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="mr-2 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger
                  className="mr-2 hidden lg:inline-flex"
                  onClick={() => setCollapsed((value) => !value)}
                  aria-controls="app-sidebar"
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                />
              </TooltipTrigger>
              <SidebarTooltipContent side="bottom">
                {collapsed ? "Expand sidebar" : "Collapse sidebar"}
              </SidebarTooltipContent>
            </Tooltip>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="control-inset hidden h-10 w-full max-w-[520px] items-center gap-2.5 rounded-xl border bg-card px-3 text-left text-xs text-muted-foreground outline-none transition-colors hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring sm:flex"
            >
              <Search className="size-4 text-[#22345b]" />
              <span className="flex-1">Search or run a command…</span>
              <kbd className="control-raised rounded-md border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                ⌘ K
              </kbd>
            </button>
            <div className="flex-1" />
            <span className="control-raised mr-2 hidden items-center gap-2 rounded-full border border-emerald-700/20 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 sm:flex">
              <span className="size-2 rounded-full bg-emerald-600" />
              Mock mode
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              aria-label="Toggle theme"
            >
              <Sun className="size-5 dark:hidden" />
              <Moon className="hidden size-5 dark:block" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="ml-1 h-10 gap-2 rounded-xl px-2"
                  aria-label="Open owner menu"
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {ownerInitials}
                  </span>
                  <span className="hidden text-sm font-medium sm:block">
                    Owner
                  </span>
                  <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-72 rounded-xl p-2 shadow-[0_18px_50px_-20px_color-mix(in_oklab,var(--foreground)_35%,transparent)]"
              >
                <div className="mb-1 flex items-center gap-3 border-b px-2.5 pb-3 pt-1.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
                    {ownerInitials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Workspace owner</p>
                    <p
                      className="truncate text-xs text-muted-foreground"
                      title={ownerEmail}
                    >
                      {ownerEmail}
                    </p>
                  </div>
                </div>
                <DropdownMenuItem asChild className="p-0">
                  <Link
                    href="/settings?tab=security#storage"
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Database />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        Storage and database
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        Review local system configuration
                      </span>
                    </span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="p-0">
                  <Link
                    href="/settings?tab=cost#budget"
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <WalletCards />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        Budget and costs
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        Open spending controls
                      </span>
                    </span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem
                  className="gap-3 px-2.5 py-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
                  disabled={signingOut}
                  onSelect={(event) => {
                    event.preventDefault();
                    void signOut();
                  }}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/10">
                    {signingOut ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <LogOut />
                    )}
                  </span>
                  <span className="font-medium">
                    {signingOut ? "Signing out…" : "Sign out"}
                  </span>
                </DropdownMenuItem>
                {accountError && (
                  <p
                    role="alert"
                    className="mx-2 mb-1 mt-2 text-xs leading-relaxed text-destructive"
                  >
                    {accountError}
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main id="main-content" className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:p-7">
            <div key={pathname} className="page-enter">
              {children}
            </div>
          </main>
        </div>
        <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
          <DialogContent className="max-w-lg p-0">
            <DialogHeader className="border-b px-5 pb-4 pt-5 pr-14">
              <DialogTitle>Go to a workspace</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={commandQuery}
                  onChange={(event) => setCommandQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search pages…"
                />
              </div>
              <div className="mt-3 space-y-1">
                {commandItems.map((item) => (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      setCommandOpen(false);
                      setCommandQuery("");
                      router.push(item.href);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted"
                  >
                    <item.icon className="size-4 text-primary" />
                    <span>{item.label}</span>
                    <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                  </button>
                ))}
                {!commandItems.length && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No matching page.
                  </p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
