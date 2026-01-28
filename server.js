const express = require("express");
const fetch = require("node-fetch");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

const MOCK_API_URL = "https://69731f5bb5f46f8b5826379d.mockapi.io/callList";
const CHECK_INTERVAL_SECONDS = 60;
const TRIGGER_ADVANCE_SECONDS = 20;

let lastCheckTime = null;
let lastProcessedCallbacks = [];

function parseCallbackTime(callback) {
  try {
    // Use callbackDateTime if available
    if (callback.callbackDateTime) {
      return new Date(callback.callbackDateTime);
    }
    // Skip if no valid time field
    return null;
  } catch (error) {
    console.error("Error parsing time for record " + callback.id, error);
    return null;
  }
}

async function checkAndUpdateCallbacks() {
  const currentTime = new Date();
  lastCheckTime = currentTime.toISOString();
  console.log("\n[" + lastCheckTime + "] Checking for callbacks...");
  try {
    const response = await fetch(MOCK_API_URL);
    if (!response.ok) {
      throw new Error("MockAPI returned " + response.status);
    }
    const callList = await response.json();
    console.log("Found " + callList.length + " total records");
    const activeCallbacks = callList.filter(item => item.isCallback === "true" || item.isCallback === true);
    console.log("Found " + activeCallbacks.length + " active callbacks");
    let updatedCount = 0;
    for (const callback of activeCallbacks) {
      const callbackTime = parseCallbackTime(callback);
      if (!callbackTime) {
        console.log("Skipping record " + callback.id + " - no valid callbackDateTime");
        continue;
      }
      const timeDiff = (callbackTime.getTime() - currentTime.getTime()) / 1000;
      console.log("Record " + callback.id + ": Callback at " + callbackTime.toISOString() + ", Time diff: " + Math.round(timeDiff) + "s");
      if (timeDiff <= TRIGGER_ADVANCE_SECONDS) {
        console.log("TRIGGERING callback for record " + callback.id);
        const updateResponse = await fetch(MOCK_API_URL + "/" + callback.id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...callback, isCallback: "false" })
        });
        if (updateResponse.ok) {
          console.log("Successfully updated record " + callback.id);
          updatedCount++;
          lastProcessedCallbacks.push({ id: callback.id, time: currentTime.toISOString(), callbackTime: callback.callbackDateTime || "N/A" });
          if (lastProcessedCallbacks.length > 10) {
            lastProcessedCallbacks.shift();
          }
        } else {
          console.error("Failed to update record " + callback.id);
        }
      }
    }
    console.log("Completed check. Updated " + updatedCount + " records.");
  } catch (error) {
    console.error("Error checking callbacks:", error.message);
  }
}

cron.schedule("* * * * *", () => { checkAndUpdateCallbacks(); });

app.get("/health", (req, res) => {
  res.json({ status: "OK", service: "Callback Scheduler", lastCheck: lastCheckTime, uptime: process.uptime(), recentCallbacks: lastProcessedCallbacks });
});

app.get("/", (req, res) => {
  res.send("<html><head><title>Callback Scheduler</title><meta http-equiv='refresh' content='30'><style>body{font-family:Arial;margin:40px;background:#f5f5f5}.container{background:white;padding:30px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}h1{color:#333}.status{display:inline-block;padding:5px 15px;border-radius:20px;background:#4CAF50;color:white}.info{margin:20px 0;padding:15px;background:#e3f2fd;border-radius:4px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:10px;text-align:left;border-bottom:1px solid #ddd}th{background:#2196F3;color:white}</style></head><body><div class='container'><h1>Callback Scheduler</h1><div class='status'>ACTIVE</div><div class='info'><strong>Service Uptime:</strong> " + Math.floor(process.uptime() / 60) + " minutes<br><strong>Last Check:</strong> " + (lastCheckTime || "Not yet run") + "<br><strong>Check Interval:</strong> Every 60 seconds<br><strong>Trigger Window:</strong> " + TRIGGER_ADVANCE_SECONDS + " seconds before callback</div><div class='recent'><h2>Recently Processed Callbacks</h2>" + (lastProcessedCallbacks.length > 0 ? "<table><tr><th>Record ID</th><th>Processed At</th><th>Scheduled Time</th></tr>" + lastProcessedCallbacks.slice().reverse().map(cb => "<tr><td>" + cb.id + "</td><td>" + new Date(cb.time).toLocaleString() + "</td><td>" + cb.callbackTime + "</td></tr>").join("") + "</table>" : "<p>No callbacks processed yet</p>") + "</div><p style='margin-top:30px;color:#666;font-size:12px'>Page auto-refreshes every 30 seconds</p></div></body></html>");
});

app.listen(PORT, () => {
  console.log("Callback Scheduler running on port " + PORT);
  console.log("Dashboard: http://localhost:" + PORT);
  console.log("Health check: http://localhost:" + PORT + "/health");
  console.log("Checking MockAPI every 60 seconds");
  checkAndUpdateCallbacks();
});
