const express = require('express');
const fetch = require('node-fetch');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 10000;
const MOCK_API_URL = 'https://69731f5bb5f46f8b5826379d.mockapi.io/callList';

app.use(express.json());

// Dashboard endpoint
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Callback Scheduler</title></head>
      <body>
        <h1>Callback Scheduler Running</h1>
        <p>Monitoring MockAPI for scheduled callbacks</p>
        <p>Check interval: Every 60 seconds</p>
        <p>Triggers within 30 seconds BEFORE scheduled time</p>
        <p><a href="/health">Health Check</a></p>
      </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Function to parse time string like "3:48 PM" in South African timezone
function parseCallbackTime(dateStr, timeStr) {
  try {
    // Parse time string (e.g., "3:48 PM")
    const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!timeMatch) return null;
    
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const period = timeMatch[3].toUpperCase();
    
    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    // Parse as South African time (UTC+2)
    const dateTimeStr = `${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    
    // Create a date in South African timezone by manually adjusting for UTC+2
    const localTime = new Date(dateTimeStr);
    // Subtract 2 hours to convert from local (SA time) to UTC
    const utcTime = new Date(localTime.getTime() - (2 * 60 * 60 * 1000));
    
    return utcTime;
  } catch (error) {
    console.error('Error parsing time:', error);
    return null;
  }
}

// Function to check and trigger callbacks
async function checkCallbacks() {
  try {
    const now = new Date();
    console.log(`[${now.toISOString()}] Checking for callbacks...`);
    
    // Show current South African time for debugging
    const saTime = new Date(now.getTime() + (2 * 60 * 60 * 1000));
    const saTimeStr = saTime.toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
    console.log(`Current time in South Africa: ${saTimeStr}`);
    
    // Fetch all records from MockAPI
    const response = await fetch(MOCK_API_URL);
    
    // Check if response is ok
    if (!response.ok) {
      console.error(`MockAPI returned status ${response.status}`);
      return;
    }
    
    const records = await response.json();
    console.log(`Found ${records.length} total records`);
    
    let updatedCount = 0;
    
    // Filter for active callbacks (isCallback = "true")
    const activeCallbacks = records.filter(record => 
      record.callbackDate && record.callbackDisplayTime && record.isCallback === "true"
    );
    
    console.log(`Found ${activeCallbacks.length} active callbacks`);
    
    // Check each active callback
    for (const record of activeCallbacks) {
      const callbackTime = parseCallbackTime(record.callbackDate, record.callbackDisplayTime);
      
      if (!callbackTime) {
        console.log(`Skipping record ${record.id} - invalid time format`);
        continue;
      }
      
      const timeDiff = Math.floor((callbackTime - now) / 1000); // seconds until callback
      
      console.log(`Record ${record.id}: Callback at ${record.callbackDate} ${record.callbackDisplayTime}, Time diff: ${timeDiff}s`);
      
      // Trigger if we're within 30 seconds BEFORE the scheduled time
      if (timeDiff >= 0 && timeDiff <= 30) {
        console.log(`⏰ TRIGGERING callback for record ${record.id} (${timeDiff}s before scheduled time)`);
        
        // Update the record: set callUser to 1 and isCallback to "false"
        const updateResponse = await fetch(`${MOCK_API_URL}/${record.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callUser: 1,
            isCallback: "false"
          })
        });
        
        if (updateResponse.ok) {
          console.log(`✅ Successfully updated record ${record.id}: callUser=1, isCallback="false"`);
          updatedCount++;
        } else {
          const errorText = await updateResponse.text();
          console.error(`❌ Failed to update record ${record.id}: ${updateResponse.status} - ${errorText}`);
        }
      } else if (timeDiff < 0 && timeDiff > -120) {
        console.log(`⚠️  Already passed - missed callback for record ${record.id} (${Math.abs(timeDiff)}s ago)`);
      }
    }
    
    // Skip records without valid data
    const skippedCount = records.length - activeCallbacks.length;
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} records - no valid callback data or isCallback != "true"`);
    }
    
    console.log(`Completed check. Updated ${updatedCount} records.`);
    console.log('---');
    
  } catch (error) {
    console.error('Error checking callbacks:', error.message);
    console.error('Full error:', error);
  }
}

// Schedule the job to run every minute
cron.schedule('* * * * *', checkCallbacks);

// Run immediately on startup
checkCallbacks();

app.listen(PORT, () => {
  console.log(`Callback Scheduler running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('Checking MockAPI every 60 seconds');
  console.log('Triggers callbacks within 30 seconds BEFORE scheduled time');
});
