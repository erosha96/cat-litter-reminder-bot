import { initDb, getLastClean } from './db.js';
import { HaWebhook } from './ha-webhook.js';
import { HaClient } from './ha-client.js';
import { Bot } from './bot.js';

await initDb();

const bot = new Bot();

const haWebhook = new HaWebhook();

const haClient = new HaClient();

setInterval(async () => {
	const states = await haClient.getStates(['counter.living_room_litter', 'counter.hall_litter']);
	await bot.checkCounter(states);
}, 60000);

setInterval(async () => {
	const lastCleanTime = (await getLastClean())?.clean_time;
	await bot.checkTime(lastCleanTime);
}, 1000);

bot.onReset = async () => {
	await haClient.resetCounter();
};

bot.onCleanModeChange = async enabled => {
	await haClient.setCleaning(enabled);
};

haWebhook.onReset = async () => {
	await bot.littersCleanedOutside();
};

haWebhook.onCleanModeChange = async enabled => {
	await bot.setCleaningModeOutside(enabled);
};

haWebhook.onIncrement = async () => {
	console.log('increment');
	const states = await haClient.getStates(['counter.living_room_litter', 'counter.hall_litter']);
	await bot.checkCounter(states);
};
