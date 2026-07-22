import fs from "fs";
import express from "express";
import { createServer as createViteServer } from "vite";
import ical from "node-ical";
import axios from "axios";
import path from "path";
import {
  generateExecutionGuide,
  generateClinicalStrategy,
  generateMachineSetupGuide,
  processLegacyChart,
  extractMachineSettingsFromImage,
} from "./server/gemini.ts";

// Error Handling: Prevent process crash on unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: "50mb" }));

  app.post("/api/gemini/executionGuide", async (req, res) => {
    try {
      const { machineName, referenceText } = req.body;
      const data = await generateExecutionGuide(machineName, referenceText);
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/gemini/clinicalStrategy", async (req, res) => {
    try {
      const {
        machineName,
        clientDetails,
        referenceText,
        clientAilments,
        machineContraindications,
      } = req.body;
      const data = await generateClinicalStrategy(
        machineName,
        clientDetails,
        referenceText,
        clientAilments,
        machineContraindications,
      );
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/gemini/machineSetup", async (req, res) => {
    try {
      const {
        machineName,
        clientDetails,
        referenceText,
        clientAilments,
        machineContraindications,
      } = req.body;
      const data = await generateMachineSetupGuide(
        machineName,
        clientDetails,
        referenceText,
        clientAilments,
        machineContraindications,
      );
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/gemini/processChart", async (req, res) => {
    try {
      const { images, expectedSessions, pageIndex, totalPages } = req.body;
      const data = await processLegacyChart(
        images,
        expectedSessions,
        pageIndex,
        totalPages,
      );
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/gemini/extractSettings", async (req, res) => {
    try {
      const { images } = req.body;
      const data = await extractMachineSettingsFromImage(images);
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/log-error", (req, res) => {
    console.log("CLIENT ERROR:", req.body);
    fs.appendFileSync("client-errors.log", JSON.stringify(req.body) + "\n");
    res.json({ ok: true });
  });

  // Background Task: Run Master Sync every 60 minutes
  /*
  const SYNC_INTERVAL = 60 * 60 * 1000;
  setInterval(async () => {
    try {
      // await masterSync();
    } catch (error: any) {
      if (error.code === 'resource-exhausted' || error.message?.toLowerCase().includes('quota')) {
        console.error('Scheduled Master Sync failed due to Quota Exceeded. Skipping until reset.');
      } else {
        console.error('Scheduled Master Sync failed:', error);
      }
    }
  }, SYNC_INTERVAL);

  // Initial sync on startup (optional but recommended)
  // masterSync().catch(err => {
    if (err.code === 'resource-exhausted' || err.message?.toLowerCase().includes('quota')) {
      console.error('Initial Master Sync skipped: Quota Limit Exceeded.');
    } else {
      console.error('Initial Master Sync failed:', err);
    }
  });
  */

  app.post("/api/parse-ical", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL is required" });
      const response = await axios.get(url);
      const data = ical.parseICS(response.data);
      const events = Object.values(data).filter(
        (ev: any) => ev.type === "VEVENT",
      );
      res.json({ events });
    } catch (e: any) {
      console.error("iCal fetch error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // API Route for Triggering Master Sync Manually
  app.post("/api/trigger-master-sync", async (req, res) => {
    try {
      const { trainerId, hardReset } = req.body;
      // Feature deprecated on server-side. Call handled by frontend.
      res.json({
        success: true,
        message: hardReset
          ? "Master Schedule Hard Reset & Resync triggered successfully"
          : `${trainerId ? "Trainer" : "Master Schedule"} Sync triggered successfully`,
      });
    } catch (error: any) {
      console.error("Manual Sync failed:", error);
      res.status(500).json({ error: error.message || "Sync failed" });
    }
  });

  // Removed diagnostic endpoint that depended on backend sync-logic.ts

  // API Route for Individual Calendar Sync (legacy/on-demand)
  app.post("/api/sync-calendar", async (req, res) => {
    try {
      const { url, trainerId, trainerName } = req.body;
      if (!url) return res.status(400).json({ error: "URL is required" });

      const response = await axios.get(url);
      const data = ical.parseICS(response.data);

      const events = [];

      // MindBody RegEx patterns for Client Names
      const patterns = [
        /Client:\s*([^(\r\n]+)/i, // Description: Client: John Doe
        /\(([^)]+)\)/, // Summary: Personal Training (John Doe)
        /^([^(:|\n]+)[:|-]/, // Summary: John Doe: Personal Training
        /for\s+([^(\r\n]+)/i, // Summary: Training for John Doe
      ];

      const extractClientName = (summary: string, description: string) => {
        const fullText = `${summary}\n${description}`;

        for (const pattern of patterns) {
          const match = fullText.match(pattern);
          if (match && match[1]) {
            const name = match[1].trim();
            // Basic validation to avoid matching service names
            if (
              name.length > 2 &&
              !name.toLowerCase().includes("training") &&
              !name.toLowerCase().includes("workout")
            ) {
              return name;
            }
          }
        }

        // Fallback: use summary but strip common prefixes
        return summary
          .replace(/Personal Training|Workout|Session/gi, "")
          .trim();
      };

      for (const k in data) {
        if (data.hasOwnProperty(k)) {
          const ev = data[k];
          if (ev.type === "VEVENT") {
            const rawSummary = ev.summary;
            const summary =
              typeof rawSummary === "object" && rawSummary !== null
                ? (rawSummary as any).val
                : rawSummary || "";

            const rawDescription = ev.description;
            const description =
              typeof rawDescription === "object" && rawDescription !== null
                ? (rawDescription as any).val
                : rawDescription || "";

            const clientName = extractClientName(summary, description);

            events.push({
              clientName,
              startTime: ev.start,
              endTime: ev.end,
              trainerName: trainerName || description || "Assigned Staff",
              trainerId: trainerId || null,
              serviceName: summary.includes("(")
                ? summary.split("(")[0].trim()
                : ev.location || "Training Session",
              status: "Scheduled",
              source: "Subscription",
            });
          }
        }
      }

      res.json({ events });
    } catch (error: any) {
      console.error("Sync error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to sync calendar" });
    }
  });

  // Mindbody Sandbox Testing Endpoint — issue user token
  app.post("/api/mindbody/issueUserToken", async (req, res) => {
    try {
      const mindbodyApiKey = process.env.MINDBODY_API_KEY;
      if (!mindbodyApiKey) {
        return res.status(500).json({
          error:
            "MINDBODY_API_KEY environment variable is not set. Please add it to the Secrets in Settings.",
        });
      }

      const { siteId, username, password } = req.body || {};

      if (!siteId || !username || !password) {
        return res.status(400).json({
          error: "siteId, username, and password are required.",
        });
      }

      const requestBody = {
        Username: username,
        Password: password,
      };

      const response = await fetch(
        "https://api.mindbodyonline.com/public/v6/usertoken/issue",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Api-Key": mindbodyApiKey,
            SiteId: String(siteId),
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error("Mindbody API Error:", response.status, errorData);
        let parsedError = errorData;
        try {
          const jsonErr = JSON.parse(errorData);
          if (jsonErr?.Error?.Message) {
            parsedError = jsonErr.Error.Message;
          }
        } catch (_) {}
        return res
          .status(response.status)
          .json({ error: `Mindbody API Error: ${parsedError}` });
      }

      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res
        .status(500)
        .json({ error: e.message || "An unexpected error occurred" });
    }
  });

  app.post("/api/mindbody/staff", async (req, res) => {
    try {
      const mindbodyApiKey = process.env.MINDBODY_API_KEY;
      if (!mindbodyApiKey) {
        return res
          .status(500)
          .json({ error: "MINDBODY_API_KEY environment variable is not set." });
      }

      const siteId = req.body?.siteId;

      if (!siteId) {
        return res.status(400).json({ error: "siteId is required" });
      }

      const apiResponse = await fetch(
        `https://api.mindbodyonline.com/public/v6/staff/staff?Limit=200`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Api-Key": mindbodyApiKey,
            SiteId: String(siteId),
          },
        },
      );

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error("Mindbody Fetch Staff Error:", apiResponse.status, errorText);
        let parsedError = errorText;
        try {
          const jsonErr = JSON.parse(errorText);
          if (jsonErr?.Error?.Message) {
            parsedError = jsonErr.Error.Message;
          }
        } catch (_) {}
        return res
          .status(apiResponse.status)
          .json({ error: `Mindbody API Error: ${parsedError}` });
      }

      const data = await apiResponse.json();
      const staffList = data.StaffMembers || data.Staff || data.staff || [];

      const normalized = staffList.map((s: any) => ({
        id: String(s.Id),
        firstName: s.FirstName || "",
        lastName: s.LastName || "",
        fullName: `${s.FirstName || ""} ${s.LastName || ""}`.trim(),
        email: s.Email || "",
        displayName: s.DisplayName || `${s.FirstName || ""} ${s.LastName || ""}`.trim(),
        imageUrl: s.ImageUrl || null,
      }));

      res.json({ staff: normalized });
    } catch (e: any) {
      console.error("Fetch staff error:", e);
      res.status(500).json({ error: e.message || "Failed to fetch staff list" });
    }
  });

  app.post("/api/mindbody/staff-appointments", async (req, res) => {
    try {
      const mindbodyApiKey = process.env.MINDBODY_API_KEY;
      if (!mindbodyApiKey) {
        return res
          .status(500)
          .json({ error: "MINDBODY_API_KEY environment variable is not set." });
      }

      const { siteId, startDate, endDate, staffIds } = req.body || {};

      if (!siteId) {
        return res.status(400).json({ error: "siteId is required" });
      }

      const now = new Date();
      const start = startDate || now.toISOString().split("T")[0];
      const end =
        endDate ||
        new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

      // Fetch staff appointments from Mindbody API v6
      const params = new URLSearchParams({
        StartDate: `${start}T00:00:00`,
        EndDate: `${end}T23:59:59`,
        Limit: "200",
      });

      if (staffIds && Array.isArray(staffIds) && staffIds.length > 0) {
        staffIds.forEach((id: string | number) =>
          params.append("StaffIds", String(id)),
        );
      }

      const apiResponse = await fetch(
        `https://api.mindbodyonline.com/public/v6/appointment/staffappointments?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Api-Key": mindbodyApiKey,
            SiteId: String(siteId),
          },
        },
      );

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(
          "Mindbody Staff Appointments Error:",
          apiResponse.status,
          errorText,
        );
        let parsedError = errorText;
        try {
          const jsonErr = JSON.parse(errorText);
          if (jsonErr?.Error?.Message) {
            parsedError = jsonErr.Error.Message;
          }
        } catch (_) {}
        return res
          .status(apiResponse.status)
          .json({ error: `Mindbody API Error: ${parsedError}` });
      }

      const data = await apiResponse.json();
      const appointments = data.Appointments || data.appointments || [];

      const normalized = appointments.map((appt: any) => ({
        Id: appt.Id,
        StaffId: appt.Staff?.Id || appt.StaffId,
        StaffFirstName: appt.Staff?.FirstName || appt.StaffFirstName || "",
        StaffLastName: appt.Staff?.LastName || appt.StaffLastName || "",
        ClientId: appt.Client?.Id || appt.ClientId || null,
        ClientFirstName: appt.Client?.FirstName || appt.ClientFirstName || "",
        ClientLastName: appt.Client?.LastName || appt.ClientLastName || "",
        StartDateTime: appt.StartDateTime,
        EndDateTime: appt.EndDateTime,
        Status: appt.Status,
        SessionTypeName:
          appt.SessionType?.Name || appt.SessionTypeName || "Training Session",
        LocationId: appt.Location?.Id || appt.LocationId || null,
      }));

      res.json({ appointments: normalized, total: normalized.length });
    } catch (e: any) {
      console.error("Staff appointments error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to fetch staff appointments" });
    }
  });

  app.post("/api/mindbody/test-webhook", async (req, res) => {
    try {
      const webhookSecret = process.env.MINDBODY_WEBHOOK_SECRET;
      const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const projectId = config.projectId;
      const webhookUrl = `https://us-central1-${projectId}.cloudfunctions.net/mindbodyWebhook`;

      const testPayload = JSON.stringify({
        messageId: `test-${Date.now()}`,
        eventId: "clientUpdated",
        eventName: "clientUpdated",
        eventData: {
          clientId: "test-client-001",
          firstName: "Test",
          lastName: "Client",
          membershipStatus: "Active",
          siteId: req.body.siteId || "-99",
        },
      });

      let signatureHeader = "test-signature";
      if (webhookSecret) {
        const crypto = await import("crypto");
        const hmac = crypto.createHmac("sha256", webhookSecret);
        hmac.update(testPayload);
        signatureHeader = hmac.digest("base64");
      }

      const webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mindbody-signature": signatureHeader,
        },
        body: testPayload,
      });
      const responseText = await webhookResponse.text();

      res.json({
        success: webhookResponse.ok,
        statusCode: webhookResponse.status,
        response: responseText,
        webhookUrl,
      });
    } catch (e: any) {
      console.error("Test webhook error:", e);
      res.status(500).json({ error: e.message || "Webhook test failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
