import TelegramBot from 'node-telegram-bot-api';
import {
	addUser,
	getAllUsers,
	getUserByTgId,
	getLitters,
	getLastRemindTime,
	setLastRemindTime,
	getLastClean,
	addClean,
} from './db.js';
import { HaClient } from './ha-client.js';

const haClient = new HaClient();

const TOKEN = process.env.BOT_TOKEN;
const ACCESS_CODE = process.env.ACCESS_CODE;

const StringCommands = {
	ADD_CLEAN: 'Я убрал у котов',
	LAST_CLEAN: 'Когда последняя уборки?',
	COUNTER: 'Сколько коты сходили',
};

const ChatStates = {
	WAIT_CODE: 'WAIT_CODE',
	ASK_NAME: 'ASK_NAME',
};

const menu = {
	reply_markup: {
		keyboard: [[StringCommands.ADD_CLEAN, StringCommands.COUNTER, StringCommands.LAST_CLEAN]],
		resize_keyboard: true,
		one_time_keyboard: false,
	},
};

const hoursFromTime = lastTime => {
	const now = new Date();
	return lastTime ? (now - lastTime) / 1000 / 60 / 60 : Infinity;
};

export class Bot {
	constructor() {
		this.bot = null;

		this.chatStates = {};

		this.ignoreOutsideReset = false;

		this.onReset = () => {};

		this.init();
	}

	async init() {
		this.bot = new TelegramBot(TOKEN, { polling: true });
		this.bot.on('message', async msg => {
			await this.onMessage(msg);
		});

		this.bot.onText(/\/start/, async msg => {
			await this.onStart(msg);
		});
	}

	async onStart(msg) {
		const chatId = msg.chat.id;
		const user = await getUserByTgId(chatId);

		if (!user) {
			this.chatStates[chatId] = ChatStates.WAIT_CODE;
			await this.bot.sendMessage(chatId, 'Введите код доступа:');
		} else {
			await this.sendMainMenu(chatId);
		}
	}

	async onMessage(msg) {
		const chatId = msg.chat.id;
		const text = msg.text?.trim();
		const user = await getUserByTgId(chatId);

		if (!user) {
			await this.sendRegistration({ chatId, text });
			return;
		}

		if (text === StringCommands.ADD_CLEAN) {
			await this.littersCleaned(user);
		}

		if (text === StringCommands.LAST_CLEAN) {
			await this.sendLastCleanMessage(user);
		}

		if (text === StringCommands.COUNTER) {
			await this.sendCounterMessage(user);
		}
	}

	async sendLastCleanMessage(user) {
		const lastClean = await getLastClean();
		const lastCleanTime = lastClean.clean_time;
		const lastCleanUserName = lastClean.name ? lastClean.name : 'кто-то';
		await this.bot.sendMessage(user.tg_id, `Последний раз убирался ${lastCleanUserName} \n${lastCleanTime}`);
	}

	async sendCounterMessage(user) {
		const states = await haClient.getStates(['counter.living_room_litter', 'counter.hall_litter']);
		const litters = await getLitters();
		const littersString = litters
			.map(l => {
				const value = states.find(s => s.entityId === l.entity_id).count;
				return `${l.name}: ${value}`;
			})
			.join('\n');
		await this.bot.sendMessage(user.tg_id, `Коты сходили:\n\n${littersString}`);
	}

	async sendBroadcastMessage({ text, withMenu = true }) {
		const users = await getAllUsers();
		for (const u of users) {
			if (withMenu) {
				await this.sendMessageWithMenu(u.tg_id, text);
			} else {
				await this.bot.sendMessage(u.tg_id, text);
			}
		}
	}

	async littersCleaned(user) {
		await addClean(user.id);
		await setLastRemindTime('count', null);
		await setLastRemindTime('time', null);
		this.ignoreOutsideReset = true;
		await this.sendBroadcastResetCounterMessage({ user });
		await this.onReset();
	}

	async littersCleanedOutside() {
		if (this.ignoreOutsideReset) {
			this.ignoreOutsideReset = false;
			return;
		}
		await addClean(null);
		await this.sendBroadcastResetCounterMessage({ user: null });
	}

	async checkCounter(states) {
		const lastRemindTime = await getLastRemindTime('count');
		const hourSinceLastRemind = hoursFromTime(lastRemindTime);
		const litters = await getLitters();
		if (states.find(litterState => litterState.count > 2) && hourSinceLastRemind > 2) {
			await this.sendBroadcastCounterReminder(
				states.map(({ count, entityId }) => ({ name: litters.find(l => l.entity_id === entityId).name, value: count }))
			);
			await setLastRemindTime('count', new Date());
		}
	}

	async checkTime(hoursSinceLastClean) {
		const lastRemindTime = await getLastRemindTime('time');
		const hourSinceLastRemind = hoursFromTime(lastRemindTime);
		if (hoursSinceLastClean >= 24 && hourSinceLastRemind > 4) {
			await this.sendBroadcastTimeReminder(hourSinceLastRemind);
			await setLastRemindTime('time', new Date());
		}
	}

	async sendBroadcastResetCounterMessage({ user }) {
		if (!user) {
			await this.sendBroadcastMessage({ text: `Кто-то убрал у котов!` });
			return;
		}
		await this.sendBroadcastMessage({ text: `${user.name} убрал у котов!` });
	}

	async sendBroadcastTimeReminder(hours) {
		await this.sendBroadcastMessage({
			text: `Прошло ${Math.floor(hours)} часов с последней уборки у котов. Проверь, что там!`,
		});
	}

	async sendBroadcastCounterReminder(litters) {
		const littersString = litters.map(l => `${l.name}: ${l.value}`).join('\n');

		await this.sendBroadcastMessage({ text: `Коты много сходили!\n\n${littersString}\n\nПора убрать!` });
	}

	async sendRegistration({ chatId, text }) {
		if (this.chatStates[chatId] === ChatStates.WAIT_CODE) {
			if (text === ACCESS_CODE) {
				this.chatStates[chatId] = ChatStates.ASK_NAME;
				await this.bot.sendMessage(chatId, 'Код принят! Как тебя зовут?');
			} else {
				await this.bot.sendMessage(chatId, 'Неверный код. Попробуй ещё раз:');
			}
			return;
		}
		if (this.chatStates[chatId] === ChatStates.ASK_NAME) {
			await addUser(chatId, text);
			delete this.chatStates[chatId];
			await this.sendMainMenu(chatId);
			return;
		}
		await this.bot.sendMessage(chatId, 'Введите /start для начала регистрации.');
	}

	async sendMessageWithMenu(chatId, text = 'Меню:') {
		await this.bot.sendMessage(chatId, text, menu);
	}

	async sendMainMenu(chatId) {
		await this.bot.sendMessage(chatId, `Выбери нужную команду:`, menu);
	}
}
