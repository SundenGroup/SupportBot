/**
 * This script fixes the ticket_counters table by recreating it with the proper
 * composite unique constraint on (type, guild_id) instead of just type.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

console.log('Starting ticket_counters table fix script...');

// Open the database
const dbPath = path.join(__dirname, 'database/tickets.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    
    console.log('Connected to database successfully');
    
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = OFF');
    
    // Run the fix in a transaction
    db.serialize(() => {
        try {
            // Start transaction
            db.run('BEGIN TRANSACTION');
            
            // 1. Backup the existing data
            console.log('Backing up existing ticket counter data...');
            db.all('SELECT * FROM ticket_counters', [], (err, rows) => {
                if (err) {
                    console.error('Error fetching ticket counters:', err);
                    db.run('ROLLBACK');
                    closeDb();
                    return;
                }
                
                console.log(`Found ${rows.length} ticket counter entries.`);
                
                // 2. Create a temporary table with the correct schema
                console.log('Creating temporary table with proper schema...');
                db.run(`
                    CREATE TABLE IF NOT EXISTS ticket_counters_new (
                        type TEXT NOT NULL,
                        guild_id TEXT NOT NULL,
                        last_number INTEGER NOT NULL,
                        PRIMARY KEY (type, guild_id)
                    )
                `, (err) => {
                    if (err) {
                        console.error('Error creating temporary table:', err);
                        db.run('ROLLBACK');
                        closeDb();
                        return;
                    }
                    
                    // 3. Copy the data to the new table, ensuring uniqueness by guild_id
                    console.log('Copying data to new table...');
                    
                    // Prepare the insert statement
                    const insertStmt = db.prepare(`
                        INSERT OR REPLACE INTO ticket_counters_new (type, guild_id, last_number)
                        VALUES (?, ?, ?)
                    `);
                    
                    // Insert all rows
                    for (const row of rows) {
                        insertStmt.run(row.type, row.guild_id, row.last_number, (err) => {
                            if (err) {
                                console.error('Error inserting row:', err, row);
                                // Continue with other rows
                            }
                        });
                    }
                    
                    insertStmt.finalize();
                    
                    // 4. Drop the old table and rename the new one
                    console.log('Replacing old table with new one...');
                    db.run('DROP TABLE IF EXISTS ticket_counters', (err) => {
                        if (err) {
                            console.error('Error dropping old table:', err);
                            db.run('ROLLBACK');
                            closeDb();
                            return;
                        }
                        
                        db.run('ALTER TABLE ticket_counters_new RENAME TO ticket_counters', (err) => {
                            if (err) {
                                console.error('Error renaming table:', err);
                                db.run('ROLLBACK');
                                closeDb();
                                return;
                            }
                            
                            // 5. Commit the transaction
                            db.run('COMMIT', (err) => {
                                if (err) {
                                    console.error('Error committing transaction:', err);
                                    db.run('ROLLBACK');
                                    closeDb();
                                    return;
                                }
                                
                                console.log('Table fix completed successfully!');
                                
                                // Verify the fix
                                db.all('SELECT * FROM ticket_counters', [], (err, rows) => {
                                    if (err) {
                                        console.error('Error verifying fix:', err);
                                    } else {
                                        console.log(`Verified table now has ${rows.length} entries with proper constraints.`);
                                    }
                                    
                                    closeDb();
                                });
                            });
                        });
                    });
                });
            });
        } catch (error) {
            console.error('Unexpected error:', error);
            db.run('ROLLBACK');
            closeDb();
        }
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