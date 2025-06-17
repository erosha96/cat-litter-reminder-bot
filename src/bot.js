import TelegramBot from 'node-telegram-bot-api';
import {
	initDb,
	addUser,
	getUserByTgId,
	getAllUsers,
	addClean,
	getLastClean,
	setLastRemindTime,
	getLastRemindTime,
} from './db.js';
import { DateTime } from 'luxon';

const TOKEN = process.env.BOT_TOKEN;
const ACCESS_CODE = process.env.ACCESS_CODE;
const NOTIFICATIONS_INTERVAL_HOURS = process.env.NOTIFICATIONS_INTERVAL_HOURS || 8;

if (!TOKEN) throw new Error('No BOT_TOKEN in env');
if (!ACCESS_CODE) throw new Error('No ACCESS_CODE in env');

await initDb();

const bot = new TelegramBot(TOKEN, { polling: true });

const tempState = {};

bot.onText(/\/start/, async msg => {
	const chatId = msg.chat.id;
	const user = await getUserByTgId(chatId);

	if (!user) {
		tempState[chatId] = 'WAIT_CODE';
		bot.sendMessage(chatId, 'Введите код доступа:');
	} else {
		sendMainMenu(chatId);
	}
});

bot.on('message', async msg => {
	const chatId = msg.chat.id;
	const text = msg.text?.trim();
	const user = await getUserByTgId(chatId);

	if (!user) {
		if (tempState[chatId] === 'WAIT_CODE') {
			if (text === ACCESS_CODE) {
				tempState[chatId] = 'ASK_NAME';
				await bot.sendMessage(chatId, 'Код принят! Как тебя зовут?');
			} else {
				await bot.sendMessage(chatId, 'Неверный код. Попробуй ещё раз:');
			}
			return;
		}
		if (tempState[chatId] === 'ASK_NAME') {
			await addUser(chatId, text);
			delete tempState[chatId];
			sendMainMenu(chatId);
			return;
		}
		bot.sendMessage(chatId, 'Введите /start для начала регистрации.');
		return;
	}

	if (text === 'Я убрал у котов') {
		await addClean(user.id);

		const users = await getAllUsers();
		for (const u of users) {
			await sendMessageWithMenu(u.tg_id, `${user.name} убрал у котов!`);
		}
		return;
	}
	if (text === 'Когда был последний раз?') {
		const last = await getLastClean();
		if (last) {
			const dt = DateTime.fromSQL(last.clean_time).setZone('Europe/Moscow');
			const formatted = dt.toFormat('dd.MM.yyyy, HH:mm');
			await sendMessageWithMenu(chatId, `Последний раз убирал(а) ${last.name} — ${formatted}`);
		} else {
			await sendMessageWithMenu(chatId, 'Пока никто не убирался у котов.');
		}
		return;
	}
});

const menu = {
	reply_markup: {
		keyboard: [['Я убрал у котов', 'Когда был последний раз?']],
		resize_keyboard: true,
		one_time_keyboard: false,
	},
};

async function sendMessageWithMenu(chatId, text = 'Меню:') {
	await bot.sendMessage(chatId, text, menu);
}

async function sendMainMenu(chatId) {
	await bot.sendMessage(chatId, `Выбери нужную команду:`, menu);
}

async function remindIfNeeded() {
	const last = await getLastClean();
	if (!last) return;
	const lastTime = new Date(last.clean_time);
	const now = new Date();
	const hoursPassed = (now - lastTime) / 1000 / 60 / 60;

	const lastRemind = await getLastRemindTime();
	const hourSinceLastRemind = lastRemind ? (now - lastRemind) / 1000 / 60 / 60 : Infinity;

	if (hoursPassed >= NOTIFICATIONS_INTERVAL_HOURS && hourSinceLastRemind >= 1) {
		const users = await getAllUsers();
		for (const u of users) {
			await bot.sendMessage(
				u.tg_id,
				`Прошло ${Math.floor(hoursPassed)} часов с последней уборки у котов. Нужно убрать!`
			);
		}
		await setLastRemindTime(now);
	}
}

setInterval(remindIfNeeded, 1 * 60 * 1000);
