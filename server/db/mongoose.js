const mongoose = require('mongoose');

let connectPromise = null;

async function connect() {
  if (connectPromise) return connectPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[MongoDB] MONGODB_URI not set — sessions will use file fallback only');
    return;
  }

  connectPromise = mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
    .then(() => {
      console.log('[MongoDB] Connected ✓');
    })
    .catch((err) => {
      console.error('[MongoDB] Connection failed:', err.message);
      connectPromise = null;
    });

  return connectPromise;
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connect, isConnected, mongoose };
