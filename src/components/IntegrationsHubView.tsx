import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Activity,
  Webhook,
  Key,
  RefreshCw,
  Server,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Link2,
  Clock,
  Terminal,
  AlertTriangle,
  AlertCircle as ErrorIcon,
  Calendar,
  Users,
  Check,
  Send,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Trainer, Studio, Client } from "../types";
import { useMindbodyHealth } from "../contexts/MindbodyHealthContext";
import { useToast } from "../contexts/ToastContext";
import firebaseConfig from "../../firebase-applet-config.json";
import { syncMindbodySchedules } from "../lib/mindbody-api-sync";

interface Props {
  authTrainer: Trainer | null;
  activeStudioId: string | null;
  onBack: () => void;
  studios: Studio[];
  trainers: Trainer[];
  clients: Client[];
}

export function IntegrationsHubView({
  authTrainer,
  activeStudioId,
  onBack,
  studios,
  trainers,
  clients,
}: Props) {
  const {
    success: toastSuccess,
    error: toastError,
    info: toastInfo,
  } = useToast();
  const health = useMindbodyHealth();
  const computedWebhookUrl = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/mindbodyWebhook`;

  const activeStudio = studios.find((s) => s.id === activeStudioId);
  const autoSync = activeStudio?.autoSyncEnabled ?? true;
  const syncInterval = String(activeStudio?.syncIntervalMinutes ?? 15);

  const [mindbodyKey, setMindbodyKey] = useState("************************");
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Webhook E2E Test State
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{
    success: boolean;
    statusCode: number;
    response: string;
    webhookUrl: string;
  } | null>(null);

  // Mindbody API Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingTrainerId, setSyncingTrainerId] = useState<string | null>(null);
  const [syncStats, setSyncStats] = useState<{
    added: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // Sync Date Range State (Default: today to +30 days)
  const getTodayStr = () => new Date().toISOString().split("T")[0];
  const getFutureStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  };
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getFutureStr(30));

  const [countdownText, setCountdownText] = useState("");
  const [dbLogs, setDbLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!autoSync) {
      setCountdownText("Paused manually");
      return;
    }

    const intervalMinutes = parseInt(syncInterval, 10);

    const updateTimer = () => {
      const now = new Date();
      const currentMinutes = now.getMinutes();
      const currentSeconds = now.getSeconds();

      const nextAlignedMinute =
        Math.ceil((currentMinutes + 0.001) / intervalMinutes) * intervalMinutes;

      let diffMinutes = nextAlignedMinute - currentMinutes - 1;
      let diffSeconds = 60 - currentSeconds;

      if (diffSeconds === 60) {
        diffSeconds = 0;
        diffMinutes += 1;
      }

      const minStr = diffMinutes > 0 ? `${diffMinutes}m ` : "";
      setCountdownText(`Running (Next sync in ${minStr}${diffSeconds}s)`);
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);
    return () => clearInterval(intervalId);
  }, [autoSync, syncInterval]);

  // Real-time Event Logs listener
  useEffect(() => {
    if (!activeStudioId) return;

    const q = query(
      collection(db, "mindbodyEventLog"),
      where("studioId", "==", activeStudioId),
      orderBy("processedAt", "desc"),
      limit(20),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetchedLogs = snap.docs.map((doc) => {
          const data = doc.data();
          const processedAt =
            data.processedAt?.toDate?.() ||
            new Date(data.processedAt || Date.now());
          return {
            id: doc.id,
            time: processedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            type:
              data.status === "error" || data.status === "Failed"
                ? "error"
                : "success",
            message:
              data.message ||
              `Processed MindBody event: ${data.eventType || "Unknown"}`,
          };
        });
        setDbLogs(fetchedLogs);
      },
      (err) => {
        console.error("Failed to stream event logs:", err);
      },
    );

    return () => unsubscribe();
  }, [activeStudioId]);

  const handleToggleAutoSync = async (checked: boolean) => {
    if (!activeStudioId) return;
    try {
      await updateDoc(doc(db, "studios", activeStudioId), {
        autoSyncEnabled: checked,
      });
      toastSuccess(`Auto-sync ${checked ? "enabled" : "disabled"}.`);
    } catch (err: any) {
      console.error(err);
      toastError("Failed to update auto-sync setting: " + err.message);
    }
  };

  const handleIntervalChange = async (interval: string) => {
    if (!activeStudioId) return;
    try {
      await updateDoc(doc(db, "studios", activeStudioId), {
        syncIntervalMinutes: parseInt(interval, 10),
      });
      toastSuccess(`Sync interval set to ${interval} minutes.`);
    } catch (err: any) {
      console.error(err);
      toastError("Failed to update polling interval: " + err.message);
    }
  };

  const handleTestConnection = () => {
    setIsTestLoading(true);
    setTimeout(() => {
      setIsTestLoading(false);
      if (health.status === "healthy" || health.status === "degraded") {
        setTestResult(
          "Success! Mindbody system endpoint is reachable and responsive.",
        );
      } else {
        setTestResult("System is offline or requires configuration.");
      }
    }, 1000);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(computedWebhookUrl);
    toastSuccess("Webhook URL copied to clipboard.");
  };

  // Trigger test webhook E2E
  const handleTestWebhook = async () => {
    if (!activeStudio?.mindbodySiteId) {
      toastError("Please configure a Mindbody Site ID for this studio first.");
      return;
    }
    setIsTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await fetch("/api/mindbody/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: activeStudio.mindbodySiteId }),
      });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();
      setWebhookTestResult(data);
      if (data.success) {
        toastSuccess("Webhook E2E test triggered! Check system logs below.");
      } else {
        toastError(`Webhook test failed with code ${data.statusCode}`);
      }
    } catch (err: any) {
      console.error(err);
      toastError("Failed to fire test webhook: " + err.message);
    } finally {
      setIsTestingWebhook(false);
    }
  };

  // Perform schedule sync from Mindbody API
  const handleSyncSchedules = async (trainerId: string | null = null) => {
    if (!activeStudio?.mindbodySiteId) {
      toastError(
        "Mindbody Site ID must be set on this studio to fetch appointments.",
      );
      return;
    }

    if (trainerId) setSyncingTrainerId(trainerId);
    else setIsSyncing(true);

    setSyncStats(null);

    try {
      const result = await syncMindbodySchedules(
        activeStudio.mindbodySiteId,
        trainers,
        clients,
        studios,
        trainerId,
        startDate,
        endDate,
        activeStudio.id,
        activeStudio.mindbodyLocationId,
      );

      setSyncStats(result);

      if (result.errors.length > 0) {
        const firstErr = result.errors[0];
        if (firstErr.includes("YOU DO NOT HAVE ACCESS TO SITEID")) {
          toastError(
            `Mindbody API Error: Developer API key needs authorization for Site ID ${activeStudio.mindbodySiteId} in Mindbody Developer Portal.`,
          );
        } else {
          toastError(`Sync completed with errors: ${firstErr}`);
        }
      } else {
        toastSuccess(
          `Sync Complete! Added: ${result.added}, Updated: ${result.updated}`,
        );
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || "";
      if (errMsg.includes("YOU DO NOT HAVE ACCESS TO SITEID")) {
        toastError(
          `Mindbody Site ID Authorization Required: Site ID ${activeStudio.mindbodySiteId} needs approval in Mindbody Developer Portal.`,
        );
      } else {
        toastError("Schedule sync failed: " + errMsg);
      }
    } finally {
      setIsSyncing(false);
      setSyncingTrainerId(null);
    }
  };

  const logs =
    dbLogs.length > 0
      ? dbLogs
      : [
          {
            id: "init",
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            type: "info",
            message:
              "System initialized. Waiting for MindBody webhook events...",
          },
        ];

  // Filter trainers for this studio
  const studioTrainers = trainers.filter(
    (t) =>
      t.primaryHomeStudioId === activeStudioId ||
      t.accessibleStudioIds?.includes(activeStudioId || ""),
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-black/40 text-slate-900 dark:text-slate-100 p-3 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full space-y-6 lg:space-y-8 pb-32">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div>
            <Button
              variant="ghost"
              className="pl-0 text-slate-500 hover:text-slate-900 dark:hover:text-white mb-2"
              onClick={onBack}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Hub
            </Button>
            <h1 className="text-2xl lg:text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Webhook className="w-6 h-6 text-[#F06C22]" />
              Integrations & Webhooks
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage Mindbody API connections, automated schedule syncing, and
              CRM data flows for {activeStudio?.name || "your studio"}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
            {health.status === "healthy" && (
              <div className="flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Operational
              </div>
            )}
            {health.status === "degraded" && (
              <div className="flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                Degraded
              </div>
            )}
            {health.status === "error" && (
              <div className="flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                <ErrorIcon className="w-3.5 h-3.5 mr-1.5" />
                Errors
              </div>
            )}
            {health.status === "offline" && (
              <div className="flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                <Activity className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
                Offline
              </div>
            )}
            <Button
              onClick={handleTestConnection}
              disabled={isTestLoading}
              variant="outline"
              className="h-9 flex-1 sm:flex-initial"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${isTestLoading ? "animate-spin" : ""}`}
              />
              Test Connect
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Left Column: API & Webhooks */}
          <div className="md:col-span-2 space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center">
                  <Server className="w-4 h-4 mr-2 text-[#F06C22]" />
                  Mindbody public API Connection
                </CardTitle>
                <CardDescription>
                  Site parameters configured to authenticate with the Mindbody
                  online system.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Mindbody Site ID
                    </label>
                    <Input
                      value={activeStudio?.mindbodySiteId || "Not Configured"}
                      disabled
                      className="bg-slate-50 dark:bg-slate-900/50 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Mindbody Location ID
                    </label>
                    <Input
                      value={activeStudio?.mindbodyLocationId ? String(activeStudio.mindbodyLocationId) : "Site Default"}
                      disabled
                      className="bg-slate-50 dark:bg-slate-900/50 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      API Authorization Key
                    </label>
                    <Input
                      type="password"
                      value={mindbodyKey}
                      onChange={(e) => setMindbodyKey(e.target.value)}
                      className="font-mono text-sm bg-slate-50 dark:bg-slate-900/50"
                      disabled
                    />
                  </div>
                </div>
                {testResult && (
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-2 flex items-center">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    {testResult}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Mindbody Staff Schedule Sync UI */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center">
                  <Calendar className="w-4 h-4 mr-2 text-indigo-500" />
                  Staff Schedule Import (API-based)
                </CardTitle>
                <CardDescription>
                  Pull appointments from Mindbody using staff IDs. Direct
                  replacement for iCal urls.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Date range picker */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      Start Sync Date
                    </label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      End Sync Date
                    </label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>

                {/* Staff Roster List */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Staff Accounts for {activeStudio?.name}
                  </h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-card">
                    {studioTrainers.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No trainers assigned to this studio yet.
                      </div>
                    ) : (
                      studioTrainers.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-3 flex-wrap gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{
                                backgroundColor: t.brandColor || "#F06C22",
                              }}
                            />
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white">
                                {t.fullName} ({t.initials})
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {t.mindbodyStaffId
                                  ? `ID: ${t.mindbodyStaffId}`
                                  : "Unlinked - No Staff ID"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {t.mindbodyStaffId ? (
                              <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 border-0 text-[10px] py-0 h-5">
                                LINKED
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 border-0 text-[10px] py-0 h-5">
                                NO ID
                              </Badge>
                            )}

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] font-black uppercase tracking-wider px-2.5 rounded-lg border-indigo-500/20 text-indigo-500 hover:bg-indigo-500/10"
                              disabled={
                                !t.mindbodyStaffId ||
                                isSyncing ||
                                syncingTrainerId !== null
                              }
                              onClick={() => handleSyncSchedules(t.id)}
                            >
                              {syncingTrainerId === t.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                "Sync Only"
                              )}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Master sync button */}
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs h-11 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                  disabled={isSyncing || syncingTrainerId !== null}
                  onClick={() => handleSyncSchedules(null)}
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Syncing Staff Schedules...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Sync All Staff Schedules from Mindbody API
                    </>
                  )}
                </Button>

                {/* Sync stats display */}
                {syncStats && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      Last Sync Results:
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold uppercase tracking-wider">
                      <div className="bg-emerald-500/10 text-emerald-600 p-2 rounded-lg">
                        Added: {syncStats.added}
                      </div>
                      <div className="bg-indigo-500/10 text-indigo-600 p-2 rounded-lg">
                        Updated: {syncStats.updated}
                      </div>
                      <div className="bg-slate-500/10 text-slate-500 p-2 rounded-lg">
                        Skipped: {syncStats.skipped}
                      </div>
                    </div>
                    {syncStats.errors.length > 0 && (
                      <div className="text-red-500 text-[10px] mt-1.5 font-mono">
                        Error: {syncStats.errors[0]}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center">
                    <Link2 className="w-4 h-4 mr-2 text-[#F06C22]" />
                    Real-time Webhook Receiver
                  </span>
                  {health.webhookSubscriptionActive ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 border-0 text-[10px] py-0 h-5">
                      ACTIVE
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 border-0 text-[10px] py-0 h-5">
                      NO SUBSCRIPTION
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Public endpoint url that receives live webhook events from
                  Mindbody.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={computedWebhookUrl}
                    readOnly
                    className="font-mono text-xs bg-slate-50 dark:bg-slate-900/50 flex-1 h-10 select-all"
                  />
                  <Button
                    variant="outline"
                    className="h-10 px-4 shrink-0 font-bold uppercase text-[10px]"
                    onClick={handleCopyUrl}
                  >
                    Copy Link
                  </Button>
                </div>

                {/* Webhook E2E Test Panel */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        E2E Webhook Pipeline Test
                      </h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                        Trigger a signed mock client update payload to verify
                        functions ingest data correctly.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleTestWebhook}
                      disabled={isTestingWebhook}
                      className="bg-orange-500 hover:bg-orange-600 text-white font-black uppercase text-[10px] tracking-wider h-8 rounded-lg"
                    >
                      {isTestingWebhook ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-3 h-3 mr-1.5" />
                          Send Test Event
                        </>
                      )}
                    </Button>
                  </div>

                  {webhookTestResult && (
                    <div className="mt-2.5 p-3 rounded-xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-slate-800 font-mono text-[10px] space-y-1.5">
                      <div className="flex justify-between font-bold">
                        <span>
                          Status Code:{" "}
                          <span
                            className={
                              webhookTestResult.success
                                ? "text-emerald-500"
                                : "text-red-500"
                            }
                          >
                            {webhookTestResult.statusCode}
                          </span>
                        </span>
                        <span>
                          Success: {String(webhookTestResult.success)}
                        </span>
                      </div>
                      <div className="text-slate-500 truncate">
                        URL: {webhookTestResult.webhookUrl}
                      </div>
                      <div className="p-2 bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 overflow-x-auto text-[9px] max-h-16">
                        {webhookTestResult.response}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Sync Engine Config & System Logs */}
          <div className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950 border-t-4 border-t-[#F06C22]">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-[#F06C22]" />
                    Auto-Sync Poller
                  </span>
                  <Switch
                    checked={autoSync}
                    onCheckedChange={handleToggleAutoSync}
                  />
                </CardTitle>
                <CardDescription>
                  Keep local tables up to date by query scheduling.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Query Frequency
                  </label>
                  <select
                    value={syncInterval}
                    onChange={(e) => handleIntervalChange(e.target.value)}
                    disabled={!autoSync}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-[#F06C22] disabled:opacity-50 font-bold"
                  >
                    <option value="5">Every 5 minutes</option>
                    <option value="15">Every 15 minutes (Recommended)</option>
                    <option value="30">Every 30 minutes</option>
                    <option value="60">Hourly</option>
                  </select>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-4">
                <div className="flex flex-col space-y-1 w-full text-xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Engine Status
                  </div>
                  <div className="font-bold flex items-center text-emerald-600 dark:text-emerald-400">
                    <Activity className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
                    {countdownText}
                  </div>
                </div>
              </CardFooter>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-[#1e1e1e] border-0 text-slate-300">
              <CardHeader className="pb-3 border-b border-white/10">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center">
                  <Terminal className="w-3.5 h-3.5 mr-2" />
                  Webhook & Sync Logs
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-72 overflow-y-auto p-4 space-y-3 font-mono text-[9px] sm:text-xs">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-2.5 border-b border-white/5 pb-2"
                    >
                      <span className="text-slate-500 shrink-0 font-bold">
                        {log.time}
                      </span>
                      <span
                        className={`break-all ${log.type === "error" ? "text-red-400 font-bold" : log.type === "warning" ? "text-yellow-400" : log.type === "success" ? "text-emerald-400" : "text-slate-300"}`}
                      >
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
