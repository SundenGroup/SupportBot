const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Check for force flag
const forceRepair = process.argv.includes('--force');

// Database paths
const dbDir = path.join(__dirname, 'database');
const dbPath = path.join(dbDir, 'tickets.db');
const backupPath = path.join(dbDir, `tickets-backup-${Date.now()}.db`);

console.log('Starting database repair process...');
console.log('Database path:', dbPath);
if (forceRepair) {
    console.log('Force repair mode enabled - will recreate database regardless of current state');
}

// First, check if the database file exists
if (!fs.existsSync(dbPath)) {
    console.log('Database file does not exist. Creating a new one...');
    createNewDatabase();
    process.exit(0);
}

// Try to back up the database
try {
    console.log(`Creating backup of existing database: ${backupPath}`);
    fs.copyFileSync(dbPath, backupPath);
    console.log('Backup created successfully');
} catch (err) {
    console.error('Error creating backup:', err);
    console.log('Continuing with repair process...');
}

// If force flag is set, skip integrity check and recreate database
if (forceRepair) {
    console.log('Force repair requested, recreating database...');
    try {
        fs.unlinkSync(dbPath);
        console.log('Removed existing database file');
    } catch (unlinkErr) {
        console.error('Error removing database file:', unlinkErr);
    }
    createNewDatabase();
    process.exit(0);
}

// Try to open the database to check if it's corrupted
const testDb = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error opening database (likely corrupted):', err);
        console.log('Creating a new database...');
        // Remove corrupted database
        try {
            fs.unlinkSync(dbPath);
            console.log('Removed corrupted database file');
        } catch (unlinkErr) {
            console.error('Error removing corrupted database:', unlinkErr);
        }
        
        createNewDatabase();
    } else {
        console.log('Database opened successfully, testing integrity...');
        
        // Run integrity check
        testDb.get("PRAGMA integrity_check", [], (err, result) => {
            testDb.close();
            
            if (err || (result && result.integrity_check !== 'ok')) {
                console.error('Database integrity check failed:', err || result);
                console.log('Creating a new database...');
                
                // Remove corrupted database
                try {
                    fs.unlinkSync(dbPath);
                    console.log('Removed corrupted database file');
                } catch (unlinkErr) {
                    console.error('Error removing corrupted database:', unlinkErr);
                }
                
                createNewDatabase();
            } else {
                console.log('Database integrity check passed. No repair needed.');
                process.exit(0);
            }
        });
    }
});

function createNewDatabase() {
    console.log('Creating new database with correct schema...');
    
    const newDb = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
            console.error('Error creating new database:', err);
            process.exit(1);
        }
        
        console.log('New database created successfully. Setting up tables...');
        
        newDb.serialize(() => {
            // Enable foreign keys
            newDb.run('PRAGMA foreign_keys = ON');
            newDb.run('PRAGMA journal_mode = WAL'); // Use Write-Ahead Logging for better stability
            
            // Create tickets table
            newDb.run(`
                CREATE TABLE IF NOT EXISTS tickets (
                    id TEXT PRIMARY KEY,
                    guild_id TEXT NOT NULL,
                    channel_id TEXT NOT NULL,
                    creator_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    closed_at INTEGER,
                    closed_by TEXT,
                    reopened_at INTEGER,
                    reopened_by TEXT,
                    last_activity INTEGER
                )
            `, handleError);

            // Create messages table for transcripts
            newDb.run(`
                CREATE TABLE IF NOT EXISTS ticket_messages (
                    id TEXT PRIMARY KEY,
                    ticket_id TEXT NOT NULL,
                    author_id TEXT NOT NULL,
                    author_name TEXT NOT NULL,
                    content TEXT,
                    timestamp INTEGER NOT NULL,
                    attachments TEXT,
                    FOREIGN KEY(ticket_id) REFERENCES tickets(id)
                )
            `, handleError);

            // Create participants table
            newDb.run(`
                CREATE TABLE IF NOT EXISTS ticket_participants (
                    ticket_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    joined_at INTEGER NOT NULL,
                    PRIMARY KEY (ticket_id, user_id),
                    FOREIGN KEY(ticket_id) REFERENCES tickets(id)
                )
            `, handleError);

            // Create actions log table
            newDb.run(`
                CREATE TABLE IF NOT EXISTS ticket_actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    details TEXT,
                    timestamp INTEGER NOT NULL,
                    FOREIGN KEY(ticket_id) REFERENCES tickets(id)
                )
            `, handleError);
            
            // Create ticket counters table with correct schema
            newDb.run(`
                CREATE TABLE IF NOT EXISTS ticket_counters (
                    type TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    last_number INTEGER NOT NULL,
                    PRIMARY KEY (type, guild_id)
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating ticket_counters table:', err);
                } else {
                    console.log('All tables created successfully');
                    console.log('Database repair completed. Please restart the bot.');
                }
                
                // Close the database
                newDb.close((closeErr) => {
                    if (closeErr) {
                        console.error('Error closing database:', closeErr);
                    }
                    process.exit(closeErr ? 1 : 0);
                });
            });
        });
    });
}

function handleError(err) {
    if (err) {
        console.error('Error creating table:', err);
    }
} 