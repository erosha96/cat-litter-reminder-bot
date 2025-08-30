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
	ADD_CLEAN: '🧹 Я убрал у котов',
	LAST_CLEAN: '🕒 Когда убирали в последний раз?',
	COUNTER: '🐾 Сколько раз коты сходили?',
	CLEANING_ON: '🚽 Включить уборку',
	CLEANING_OFF: '🚽 Выключить уборку',
};

const ChatStates = {
	WAIT_CODE: 'WAIT_CODE',
	ASK_NAME: 'ASK_NAME',
};

const hoursFromTime = lastTime => {
	const now = new Date();
	return lastTime ? (now - lastTime) / 1000 / 60 / 60 : Infinity;
};

const randomText = arr => arr[Math.floor(Math.random() * arr.length)];

export class Bot {
	constructor() {
		this.bot = null;
		this.chatStates = {};
		this.ignoreOutsideReset = false;
		this.ignoreOutsideCleanMode = false;
		this.cleanModeEnabled = false;
		this.onReset = () => {};
		this.onCleanModeChange = () => {};
		this.init();
	}

	buildMenu() {
		let cleanModeKey = StringCommands.CLEANING_ON;
		if (this.cleanModeEnabled) {
			cleanModeKey = StringCommands.CLEANING_OFF;
		}
		return {
			reply_markup: {
				keyboard: [
					[StringCommands.ADD_CLEAN, cleanModeKey],
					[StringCommands.LAST_CLEAN, StringCommands.COUNTER],
				],
				resize_keyboard: true,
				one_time_keyboard: false,
			},
		};
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
			await this.bot.sendMessage(chatId, randomText(['🐾 Мяу! Жду твой код доступа:']));
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
		if (text === StringCommands.CLEANING_ON) {
			await this.setCleaningMode(user, true);
		}

		if (text === StringCommands.CLEANING_OFF) {
			await this.setCleaningMode(user, false);
		}
	}

	async setCleaningMode(user, enabled) {
		try {
			this.cleanModeEnabled = enabled;
			this.ignoreOutsideCleanMode = true;
			this.onCleanModeChange(enabled);
			await this.sendCleaningModeMessage(user);
		} catch (e) {
			console.error('Ошибка при управлении режимом уборки:', e);
			await this.bot.sendMessage(user.tg_id, '⚠️ Не удалось изменить режим уборки.');
		}
	}

	async setCleaningModeOutside(enabled) {
		if (this.ignoreOutsideCleanMode && enabled === this.cleanModeEnabled) {
			this.ignoreOutsideCleanMode = false;
			return;
		}

		this.cleanModeEnabled = enabled;
		await this.sendCleaningModeMessage();
	}

	async sendCleaningModeMessage(user = {}) {
		const userName = user.name ? user.name : 'Кто-то';
		const text = this.cleanModeEnabled
			? `🚽 ${userName} начал убираться!\n🧹 Режим уборки включен.\n⏸️ Счётчики временно приостановлены.`
			: `✅ Режим уборки отключен.\n📊 Считаем походы в лотки дальше 🐾`;
		await this.sendBroadcastMessage({ text });
	}

	async sendLastCleanMessage(user) {
		const lastClean = await getLastClean();
		const lastCleanTime = lastClean.clean_time;
		const lastCleanUserName = lastClean.name ? lastClean.name : 'кто-то';
		await this.bot.sendMessage(user.tg_id, `🕒 Последний раз убирался ${lastCleanUserName}\n📅 ${lastCleanTime}`);
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
		await this.bot.sendMessage(user.tg_id, `📊 Счётчик посещений лотка:\n\n${littersString}`);
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
		const name = user?.name || 'Кто-то';

		const phrases = [
			'🧹 {name} убрал у котиков! Спасибо! 💖',
			'✨ Лоток снова чист! {name} — ты велик!',
			'🐾 Лоток убран! {name}, ты герой!',
			'😺 {name} сделал доброе дело — почистил лоток!',
			'🪣 {name} наводит блеск и порядок!',
			'💎 {name} вернул лотку сияние чистоты!',
			'📢 Ура! {name} убрал у котиков!',
			'🧽 {name} выполнил миссию "Чистый лоток"!',
			'🚀 {name} завершил уборку быстрее света!',
			'🎉 {name} навёл порядок в кошачьем царстве!',
			'🐱 {name} — гордость котиков!',
			'💖 Котики шлют спасибо: {name} убрал у них!',
			'🍀 {name} принёс чистоту и свежесть!',
			'🏅 {name} получает медаль за чистоту!',
			'🌟 {name} — наш уборочный супергерой!',
			'🛎 {name} пришёл на зов лотка!',
			'📅 {name} не забыл про уборку сегодня!',
			'🕒 {name} убрал вовремя — котики счастливы!',
			'🧼 {name} сделал лоток как новенький!',
			'😻 {name}, котики в восторге от чистоты!',
		];

		const text = randomText(phrases).replace('{name}', name);
		await this.sendBroadcastMessage({ text });
	}

	async sendBroadcastTimeReminder(hours) {
		await this.sendBroadcastMessage({
			text: randomText([
				`⏳ Прошло ${Math.floor(hours)} ч с последней уборки. Мяу, пора заглянуть к лоточку 🐱`,
				`🕒 Уже ${Math.floor(hours)} часов без уборки. Котики ждут чистоту 🐾`,
				`⌛ ${Math.floor(hours)} ч без уборки — пора порадовать котиков!`,
				`😺 Котики шепчут: прошло ${Math.floor(hours)} ч… Пора навести порядок 🧹`,
				`🐾 ${Math.floor(hours)} часов котики терпят… сделай им приятно и убери 💖`,
				`🧼 Хозяин, прошло ${Math.floor(hours)} ч! Лоток ждёт обновления до версии "Чисто 2.0" ✨`,
				`📅 ${Math.floor(hours)} ч без уборки — пора исправить ситуацию 🚀`,
				`😹 Лоток уже соскучился по тебе за ${Math.floor(hours)} ч!`,
				`🛎 Напоминание: ${Math.floor(hours)} ч с последней уборки. Пора взяться за дело 🧹`,
				`💌 Сообщение от котиков: ${Math.floor(hours)} ч без уборки. Мы ждём! 🐱`,
				`🧺 Прошло ${Math.floor(hours)} ч — пора закатать рукава и действовать 💪`,
				`🌟 Лоток ждёт блеска уже ${Math.floor(hours)} ч!`,
				`🧽 Миссия "Чистый лоток" активна — ${Math.floor(hours)} ч без уборки 🐾`,
				`📢 Котики объявляют: ${Math.floor(hours)} ч без уборки — пора менять ситуацию!`,
				`💤 ${Math.floor(hours)} ч покоя… но пора пробудить уборочную силу! 🧹`,
				`🕵️ Следы котиков копятся уже ${Math.floor(hours)} ч — надо убрать доказательства 🧽`,
				`🐕 Ой… это не собаки, это котики! ${Math.floor(hours)} ч без уборки 🐾`,
				`💎 Лоток хочет сверкать, а прошло уже ${Math.floor(hours)} ч…`,
				`😼 ${Math.floor(hours)} ч без уборки — котики готовят заговор 😹`,
				`🪣 Совочек в руки! ${Math.floor(hours)} ч котики ждали этого момента 🧹`,
			]),
		});
	}

	async sendBroadcastCounterReminder(litters) {
		const littersString = litters.map(l => `${l.name}: ${l.value}`).join('\n');
		await this.sendBroadcastMessage({
			text: randomText([
				`📈 Вот это они насрали!\n\n${littersString}\n\nСовок в руки и вперед 😺`,
				`📈 Котики сегодня активны!\n\n${littersString}\n\nПора навести чистоту 🧹✨`,
				`🐾 Много следов в лотке!\n\n${littersString}\n\nЛучше прибраться 🧼`,
				`🧻 Лоток используется часто:\n\n${littersString}\n\nМожет, пора убраться?`,
				`😺 Кажется, лоток зовёт тебя!\n\n${littersString}\n\nВремя уборки 🧹`,
				`🐱 Ох, котики постарались!\n\n${littersString}\n\nДавай наведём порядок ✨`,
				`🚽 Лоточек уже заждался чистки!\n\n${littersString}\n\nПора заняться делом 💪`,
				`🌊 Волна котячей активности!\n\n${littersString}\n\nЧистота спасёт мир 🧽`,
				`💩 Следы миссии котиков обнаружены!\n\n${littersString}\n\nПора к делу 🧹`,
				`📊 Активность в лотке выше нормы!\n\n${littersString}\n\nСрочно навести чистоту ✨`,
				`🧺 Время стирки… ой, то есть уборки лотка!\n\n${littersString}`,
				`🐕 Ой, это не собаки, это котики трудились!\n\n${littersString}\n\nНаведи порядок 🧼`,
				`🛎 Лоток вызывает уборщика!\n\n${littersString}\n\nПриступаем к операции 🧹`,
				`🕵️ Следы котиков зафиксированы!\n\n${littersString}\n\nВремя убирать 🧽`,
				`💥 Котики устроили движ в лотке!\n\n${littersString}\n\nПора всё почистить 🧹`,
				`🌟 Лоток ждёт обновления до версии "Чисто 2.0"!\n\n${littersString}`,
				`📌 Напоминание от котиков:\n\n${littersString}\n\nПожалуйста, убери 🙏`,
				`😹 Лоток уже не узнать!\n\n${littersString}\n\nЧистка спасёт ситуацию 🧼`,
				`🧼 Хозяин, ну почисти…\n\n${littersString}\n\nПожалуйста 😺`,
				`🧾 Отчёт об активности котиков:\n\n${littersString}\n\nВремя уборки!`,
				`🪣 Пора взять совок и навести блеск!\n\n${littersString}`,
			]),
		});
	}

	async sendRegistration({ chatId, text }) {
		if (this.chatStates[chatId] === ChatStates.WAIT_CODE) {
			if (text === ACCESS_CODE) {
				this.chatStates[chatId] = ChatStates.ASK_NAME;
				await this.bot.sendMessage(
					chatId,
					randomText([
						'✅ Код принят! Как тебя зовут, герой чистоты? 😺',
						'🎉 Всё верно! Представься, пожалуйста:',
						'👍 Код подошёл! Теперь скажи своё имя:',
					])
				);
			} else {
				await this.bot.sendMessage(
					chatId,
					randomText([
						'❌ Код не подошёл 🙈 Попробуй ещё раз:',
						'🚫 Увы, код неверный. Давай ещё раз:',
						'😿 Нет, это не тот код. Попробуешь снова?',
					])
				);
			}
			return;
		}
		if (this.chatStates[chatId] === ChatStates.ASK_NAME) {
			await addUser(chatId, text);
			delete this.chatStates[chatId];
			await this.sendMainMenu(chatId);
			return;
		}
		await this.bot.sendMessage(chatId, '📋 Набери /start, чтобы начать регистрацию.');
	}

	async sendMessageWithMenu(chatId, text = '📋 Меню:') {
		await this.bot.sendMessage(chatId, text, this.buildMenu());
	}

	async sendMainMenu(chatId) {
		await this.bot.sendMessage(chatId, '⬇️ Выбери, что сделать дальше:', this.buildMenu());
	}
}
