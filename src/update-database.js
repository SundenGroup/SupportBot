const sqlite3 = require('sqlite3').verbose();
const path = require('path');

console.log('Starting database schema update...');

// Open the database
const dbPath = path.join(__dirname, 'database/tickets.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    
    console.log('Connected to database successfully');
    
    // Check if reopened_at and reopened_by columns exist
    db.get("PRAGMA table_info(tickets)", [], (err, rows) => {
        if (err) {
            console.error('Error checking table schema:', err);
            closeDb();
            return;
        }
        
        console.log('Checking if reopened_at and reopened_by columns exist...');
        
        // Add the missing columns
        db.serialize(() => {
            // Add reopened_at column
            db.run(`ALTER TABLE tickets ADD COLUMN reopened_at INTEGER`, (err) => {
                if (err) {
                    if (err.message.includes('duplicate column name')) {
                        console.log('Column reopened_at already exists, skipping...');
                    } else {
                        console.error('Error adding reopened_at column:', err);
                    }
                } else {
                    console.log('Added reopened_at column');
                }
                
                // Add reopened_by column
                db.run(`ALTER TABLE tickets ADD COLUMN reopened_by TEXT`, (err) => {
                    if (err) {
                        if (err.message.includes('duplicate column name')) {
                            console.log('Column reopened_by already exists, skipping...');
                        } else {
                            console.error('Error adding reopened_by column:', err);
                        }
                    } else {
                        console.log('Added reopened_by column');
                    }
                    
                    console.log('Database schema update completed');
                    closeDb();
                });
            });
        });
    });
});

function closeDb() {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
            process.exit(1);
        }
        console.log('Database connection closed');
        process.exit(0);
    });
} 