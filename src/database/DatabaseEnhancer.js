const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class DatabaseEnhancer {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
        this.isInitialized = false;
        this.lastBackupTime = 0;
        this.backupIntervalHours = 24; // Make backups every 24 hours
    }

    /**
     * Initialize the database with enhanced error handling
     */
    async init() {
        return new Promise((resolve, reject) => {
            // Ensure the database directory exists
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // Check if we need to create a backup
            this.checkAndCreateBackup();

            // Open the database connection
            this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                    return;
                }

                // Enable foreign keys and other pragmas for better stability
                this.db.serialize(() => {
                    this.db.run('PRAGMA foreign_keys = ON');
                    this.db.run('PRAGMA journal_mode = WAL'); // Use Write-Ahead Logging for better concurrency and crash resistance
                    this.db.run('PRAGMA synchronous = NORMAL'); // Balance between safety and performance
                    
                    // Check database integrity
                    this.db.get('PRAGMA integrity_check', [], (err, result) => {
                        if (err) {
                            console.error('Database integrity check error:', err);
                            reject(err);
                            return;
                        }

                        if (result.integrity_check !== 'ok') {
                            console.error('Database integrity check failed:', result);
                            // If integrity check fails, we would handle recovery here
                            this.handleCorruptDatabase();
                            reject(new Error('Database integrity check failed'));
                            return;
                        }

                        console.log('Database opened with enhanced error handling');
                        this.isInitialized = true;
                        resolve();
                    });
                });
            });
        });
    }

    /**
     * Check if a backup is needed and create one if necessary
     */
    checkAndCreateBackup() {
        // Only backup once per interval
        const now = Date.now();
        const hoursSinceLastBackup = (now - this.lastBackupTime) / (1000 * 60 * 60);
        
        if (hoursSinceLastBackup < this.backupIntervalHours && this.lastBackupTime !== 0) {
            return;
        }

        try {
            // Check if the database file exists before backing up
            if (fs.existsSync(this.dbPath)) {
                const backupDir = path.join(path.dirname(this.dbPath), 'backups');
                
                // Create backup directory if it doesn't exist
                if (!fs.existsSync(backupDir)) {
                    fs.mkdirSync(backupDir, { recursive: true });
                }
                
                // Create backup with timestamp
                const backupPath = path.join(backupDir, `tickets-${now}.db`);
                fs.copyFileSync(this.dbPath, backupPath);
                console.log(`Created database backup: ${backupPath}`);
                
                // Update last backup time
                this.lastBackupTime = now;
                
                // Clean up old backups (keep only last 5)
                this.cleanupOldBackups(backupDir, 5);
            }
        } catch (err) {
            console.error('Error creating database backup:', err);
        }
    }

    /**
     * Clean up old backups, keeping only the most recent ones
     */
    cleanupOldBackups(backupDir, keepCount) {
        try {
            const backupFiles = fs.readdirSync(backupDir)
                .filter(file => file.startsWith('tickets-') && file.endsWith('.db'))
                .map(file => ({
                    name: file,
                    path: path.join(backupDir, file),
                    time: parseInt(file.replace('tickets-', '').replace('.db', ''))
                }))
                .sort((a, b) => b.time - a.time); // Sort newest to oldest
            
            // Delete all but the most recent backups
            if (backupFiles.length > keepCount) {
                backupFiles.slice(keepCount).forEach(file => {
                    fs.unlinkSync(file.path);
                    console.log(`Deleted old backup: ${file.name}`);
                });
            }
        } catch (err) {
            console.error('Error cleaning up old backups:', err);
        }
    }

    /**
     * Handle corrupt database scenario
     */
    handleCorruptDatabase() {
        console.error('Database corruption detected, attempting recovery...');
        
        try {
            // Create recovery file path
            const recoveryPath = `${this.dbPath}.recovery`;
            
            // Try to make a recovery copy
            if (fs.existsSync(this.dbPath)) {
                fs.copyFileSync(this.dbPath, recoveryPath);
                console.log(`Created recovery copy at: ${recoveryPath}`);
            }
            
            // Find the most recent backup
            const backupDir = path.join(path.dirname(this.dbPath), 'backups');
            if (fs.existsSync(backupDir)) {
                const backupFiles = fs.readdirSync(backupDir)
                    .filter(file => file.startsWith('tickets-') && file.endsWith('.db'))
                    .map(file => ({
                        name: file,
                        path: path.join(backupDir, file),
                        time: parseInt(file.replace('tickets-', '').replace('.db', ''))
                    }))
                    .sort((a, b) => b.time - a.time); // Sort newest to oldest
                
                if (backupFiles.length > 0) {
                    const mostRecentBackup = backupFiles[0];
                    console.log(`Found most recent backup: ${mostRecentBackup.name}`);
                    
                    // Close the current connection
                    if (this.db) {
                        this.db.close();
                    }
                    
                    // Restore from backup
                    fs.copyFileSync(mostRecentBackup.path, this.dbPath);
                    console.log('Restored database from backup');
                    
                    // Reopen the database
                    return this.init();
                }
            }
            
            // If no backup found, create a new database
            console.log('No backup found, will create a new database on restart');
            if (this.db) {
                this.db.close();
            }
            
        } catch (err) {
            console.error('Error during database recovery:', err);
        }
    }

    /**
     * Safely execute a database query with added error handling
     * @param {string} method - The database method to call (get, all, run, etc.)
     * @param {string} query - The SQL query
     * @param {Array} params - Query parameters
     * @param {Function} callback - Optional callback function
     * @returns {Promise} A promise resolving to the query result
     */
    async safeQuery(method, query, params = [], callback = null) {
        if (!this.isInitialized) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const handleResult = (err, result) => {
                if (err) {
                    console.error(`Error executing ${method}:`, err);
                    console.error('Query:', query);
                    console.error('Params:', params);

                    // Check for database corruption
                    if (err.message.includes('malformed') || 
                        err.message.includes('corrupt') || 
                        err.message.includes('not a database')) {
                        this.handleCorruptDatabase();
                    }

                    reject(err);
                    return;
                }

                if (callback) {
                    callback(result);
                }
                resolve(result);
            };

            try {
                // Execute the appropriate database method
                if (method === 'run') {
                    this.db[method](query, params, function(err) {
                        handleResult(err, { 
                            lastID: this.lastID, 
                            changes: this.changes 
                        });
                    });
                } else {
                    this.db[method](query, params, handleResult);
                }
            } catch (err) {
                console.error('Exception executing query:', err);
                reject(err);
            }
        });
    }

    /**
     * Close the database connection
     */
    async close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close(err => {
                    if (err) {
                        console.error('Error closing database:', err);
                        reject(err);
                        return;
                    }
                    this.isInitialized = false;
                    console.log('Database connection closed');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = DatabaseEnhancer; 