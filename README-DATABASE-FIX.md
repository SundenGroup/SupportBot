# Fixing Database Corruption in Clutch Support Bot

This guide explains how to fix the SQLite database corruption issues in the Clutch Support bot.

## The Problem

You're seeing errors like:

```
Failed to create the match management channel. Please try again later.
A match control room already exists: # match-control. Only one control room of each type is allowed at a time.
Failed to create the support management channel. Please try again later.
Failed to create the dos testar management channel: SQLITE_CORRUPT: database disk image is malformed.
```

These errors occur when the SQLite database file gets corrupted, which can happen due to:
- Unexpected shutdowns
- Disk issues
- Concurrent access problems
- Running out of disk space

## Quick Fix Solution

We've created three scripts to help fix the database issues:

1. `src/repair-database.js` - Repairs the corrupted database
2. `src/database/DatabaseEnhancer.js` - Provides enhanced SQLite error handling
3. `src/update-database-enhancer.js` - Updates your Database class to use the enhancer

### Step 1: Repair the corrupted database

First, stop the bot if it's running, then:

```bash
node src/repair-database.js
```

This will:
- Back up your existing database
- Check if it's corrupted
- Create a new database with the correct schema if needed

For a forced repair (completely recreate the database):

```bash
node src/repair-database.js --force
```

### Step 2: Implement the enhanced database handling

After repairing the database, you can implement the enhanced error handling:

```bash
node src/update-database-enhancer.js
```

This will:
- Back up your existing Database.js file
- Replace it with an enhanced version that:
  - Performs automatic backups
  - Has better error handling
  - Uses Write-Ahead Logging for better crash resistance
  - Recovers automatically from corruption
  - Prevents common SQLite errors

### Step 3: Restart the bot

After making these changes, restart the bot.

## What These Fixes Do

1. **Database Repair**: Recreates a clean database structure
2. **Enhanced Error Handling**: Improves how database errors are handled
3. **Automatic Backups**: Creates regular backups to prevent data loss
4. **Integrity Checking**: Constantly monitors database health
5. **Write-Ahead Logging**: Uses SQLite WAL mode for better stability

## Preventing Future Corruption

To prevent future database corruption:

1. **Graceful Shutdowns**: Always shut down the bot properly (Ctrl+C instead of forcibly killing)
2. **Disk Space**: Ensure sufficient disk space on your server
3. **Database Maintenance**: Periodically check and vacuum the database
4. **Monitor Logs**: Watch for early warning signs of database issues

## Manual Fix (If All Else Fails)

If the automated solutions don't work, you can manually fix the issue:

1. Stop the bot
2. Delete the database file:
   ```bash
   rm src/database/tickets.db
   ```
3. Restart the bot (it will create a new database)

Note: This will lose all ticket data and history.

## Technical Details

The fixes implement several SQLite best practices:

1. **WAL Mode**: Changes journal mode to Write-Ahead Logging
2. **Foreign Keys**: Ensures foreign key constraints are enforced
3. **Backup Management**: Creates and rotates backups
4. **Error Recovery**: Detects and handles corruption automatically
5. **Connection Pooling**: Better manages database connections

## Need Help?

If you continue to experience database issues after applying these fixes, check:
- Server disk health
- Available disk space
- Application logs for more detailed error messages

The enhanced database code should prevent most corruption issues in the future, but SQLite databases can still be vulnerable to system-level problems like disk failures or out-of-memory conditions. 