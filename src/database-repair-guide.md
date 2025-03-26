# Database Repair Guide for Clutch Support Bot

This guide will help you fix the "SQLITE_CORRUPT: database disk image is malformed" error that's causing issues when creating control rooms.

## Quick Fix Steps

1. Stop the bot if it's running
2. Run the repair script:
   ```
   node src/repair-database.js
   ```
3. Restart the bot

## What's Happening?

The SQLite database file (`src/database/tickets.db`) has become corrupted, causing errors like:

- "Failed to create the match management channel. Please try again later."
- "SQLITE_CORRUPT: database disk image is malformed"

This can happen due to:
- Unexpected bot shutdowns
- Disk errors
- Multiple processes accessing the database at once
- Running out of disk space

## Enhanced Error Handling

We've also created a `DatabaseEnhancer.js` class that provides:

1. Automatic database backups every 24 hours
2. Integrity checking
3. Corruption detection and recovery
4. Better error handling
5. Write-Ahead Logging for better stability

### Implementing Enhanced Database Handling

To use the enhanced database handling:

1. Open `src/database/Database.js`
2. Replace the existing implementation with the new DatabaseEnhancer:

```javascript
const DatabaseEnhancer = require('./DatabaseEnhancer');
const path = require('path');

class Database {
    constructor() {
        console.log('Initializing enhanced database...');
        const dbPath = path.join(__dirname, 'tickets.db');
        this.enhancer = new DatabaseEnhancer(dbPath);
        this.db = null;
    }

    async init() {
        try {
            await this.enhancer.init();
            this.db = this.enhancer.db;
            console.log('Enhanced database initialized successfully');
        } catch (error) {
            console.error('Enhanced database initialization error:', error);
            throw error;
        }
    }

    // All other methods stay the same, but should use this.enhancer.safeQuery instead of direct db calls
    // Example:
    // async getActiveTickets(guildId) {
    //    const query = `SELECT * FROM tickets WHERE status = "open" ${guildId ? ' AND guild_id = ?' : ''}`;
    //    const params = guildId ? [guildId] : [];
    //    const rows = await this.enhancer.safeQuery('all', query, params);
    //    return rows || [];
    // }

    async close() {
        return this.enhancer.close();
    }
}

module.exports = Database;
```

## Prevention Measures

To prevent database corruption in the future:

1. Always gracefully shut down the bot (use CTRL+C instead of force-closing)
2. Ensure you have enough disk space
3. Run regular database backups
4. Consider using the DatabaseEnhancer for more robust handling

## If Problems Persist

If you continue to experience database corruption:

1. Try running the repair script with the force option:
   ```
   node src/repair-database.js --force
   ```

2. Manually delete the database file and let it recreate:
   ```
   rm src/database/tickets.db
   ```

3. Check your server's disk health and available space
