const express = require('express');
const fetch = require('node-fetch');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 10000;
const MOCK_API_URL = 'https://679a70c4096b4eadba7f5609.mockapi.io/api/v1/callbacks';

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
        <p><a href="/health">Health Check</a></p>
      </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Function to check and trigger callbacks
async function checkCallbacks() {
  try {
    console.log(`[${new Date().toISOString()}] Checking for callbacks...`);
    
    // Fetch all records from MockAPI
    const response = await fetch(MOCK_API_URL);
    const records = await response.json();
    
    console.log(`Found ${records.length} total records`);
    
    const now = new Date();
    let updatedCount = 0;
    
    // Filter for active callbacks
    const activeCallbacks = records.filter(record => 
      record.callbackDateTime && record.callbackStatus === 'scheduled'
    );
    
    console.log(`Found ${activeCallbacks.length} active callbacks`);
    
    // Check each active callback
    for (const record of activeCallbacks) {
      const callbackTime = new Date(record.callbackDateTime);
      const timeDiff = Math.floor((callbackTime - now) / 1000); // seconds until callback
      
      console.log(`Record ${record.id}: Callback at ${record.callbackDateTime}, Time diff: ${timeDiff}s`);
      
      // If callback time has passed (timeDiff is negative or zero)
      if (timeDiff <= 0) {
        console.log(`⏰ TRIGGERING callback for record ${record.id}`);
        
        // Update the record to mark callback as completed
        const updateResponse = await fetch(`${MOCK_API_URL}/${record.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callbackStatus: 'completed',
            callbackTriggeredAt: now.toISOString()
          })
        });
        
        if (updateResponse.ok) {
          console.log(`✅ Successfully updated record ${record.id}`);
          updatedCount++;
        } else {
          console.error(`❌ Failed to update record ${record.id}`);
        }
      }
    }
    
    // Skip records without valid callbackDateTime
    const skippedCount = records.length - activeCallbacks.length;
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} records - no valid callbackDateTime or not scheduled`);
    }
    
    console.log(`Completed check. Updated ${updatedCount} records.`);
    console.log('---');
    
  } catch (error) {
    console.error('Error checking callbacks:', error);
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
});
