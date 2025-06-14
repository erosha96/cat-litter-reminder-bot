import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const dbPromise = open({
	filename: '/app/data/catbot.sqlite',
	driver: sqlite3.Database,
});

export async function initDb() {
	const db = await dbPromise;
	await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id INTEGER UNIQUE,
            name TEXT
        );
        CREATE TABLE IF NOT EXISTS cleans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            clean_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY CHECK (id = 0),
            last_remind DATETIME
            );
        INSERT OR IGNORE INTO reminders (id, last_remind) VALUES (0, NULL);
    `);
}

export async function getLastRemindTime() {
	const db = await dbPromise;
	const row = await db.get(`SELECT last_remind FROM reminders WHERE id = 0`);
	return row?.last_remind ? new Date(row.last_remind) : null;
}

export async function setLastRemindTime(time) {
	const db = await dbPromise;
	await db.run(`UPDATE reminders SET last_remind = ? WHERE id = 0`, [time.toISOString()]);
}

export async function addUser(tg_id, name) {
	const db = await dbPromise;
	await db.run(`INSERT OR IGNORE INTO users (tg_id, name) VALUES (?, ?)`, [tg_id, name]);
}

export async function getUserByTgId(tg_id) {
	const db = await dbPromise;
	return db.get(`SELECT * FROM users WHERE tg_id = ?`, [tg_id]);
}

export async function getAllUsers() {
	const db = await dbPromise;
	return db.all(`SELECT * FROM users`);
}

export async function addClean(user_id) {
	const db = await dbPromise;
	await db.run(`INSERT INTO cleans (user_id) VALUES (?)`, [user_id]);
}

export async function getLastClean() {
	const db = await dbPromise;
	return db.get(`
        SELECT c.*, u.name FROM cleans c
        LEFT JOIN users u ON c.user_id = u.id
        ORDER BY clean_time DESC LIMIT 1
    `);
}
