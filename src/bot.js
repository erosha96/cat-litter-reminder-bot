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

export const Messages = {
	registration: {
		askCode: ['🐾 Мяу! Жду твой код доступа:'],
		codeAccepted: [
			'✅ Код принят! Как тебя зовут, герой чистоты? 😺',
			'🎉 Всё верно! Представься, пожалуйста:',
			'👍 Код подошёл! Теперь скажи своё имя:',
		],
		codeRejected: [
			'❌ Код не подошёл 🙈 Попробуй ещё раз:',
			'🚫 Увы, код неверный. Давай ещё раз:',
			'😿 Нет, это не тот код. Попробуешь снова?',
		],
		alreadyRegistered: [
			'📋 Набери /start, чтобы начать регистрацию.',
			'🐱 Чтобы зарегистрироваться, используй команду /start.',
			'📲 Напиши /start, чтобы пройти регистрацию.',
		],
	},

	cleaningMode: {
		on: [
			'🚽 {name} взялся за совок. Ну, удачи… 🐾',
			'🧹 {name} пошёл чистить дерьмодель! Счётчики отдыхают.',
			'😼 {name}, а ты точно готов? Режим уборки включен!',
			'🪣 {name} залез в говносхрон. Храбрец!',
			'🚧 {name} пошёл в шахту… ой, то есть в лоток.',
			'✨ {name} решил навести марафет. Счётчики — стоп.',
			'💩 {name} пошёл сражаться с кучей. Держись, герой!',
			'😹 {name}, ну ты мазохист… Режим уборки стартовал!',
			'📛 {name} активировал режим "Туалетный спецназ".',
			'🍺 {name}, налей пива после… режим уборки включен!',
			'🐾 {name} идёт разгребать котячий апокалипсис.',
			'🧽 {name} полез в бой с комками. Ф топку счётчики.',
			'🚀 {name} стартовал миссию "Чистый лоток".',
			'🔥 {name} пошёл на подвиг. Совок с тобой!',
			'🤢 {name} активировал режим уборки. Ну, фу, бляха…',
			'👃 {name}, держи нос! Режим уборки врублен.',
			'💀 {name}, не сдохни там! Уборка пошла.',
			'⚠️ {name}, берегись минного поля. Режим включён!',
			'🐱 {name}, коты смотрят… не облажайся!',
			'🎭 {name} стал рабом лотка. Счётчики замолкли.',
		],
		off: [
			'✅ Закончил ковыряться. Счётчики включены.',
			'🐾 Коты снова под надзором. Подсчёт пошёл.',
			'📊 Всё, отдыхаем от уборки. Лотки считаем дальше.',
			'🎉 Уборка свершилась. Теперь следим за котами.',
			'🧹 Совок отложен. Пусть коты срочно тестят.',
			'😼 Отстрелялся! Подсчёт восстановлен.',
			'🚽 Конец смены. Счётчики бодрствуют.',
			'🧽 Лоток сияет, счётчики снова работают.',
			'🪣 Хватит махать совком. Пора считать визиты.',
			'🐱 Миссия выполнена. Учёт возобновлён.',
			'📛 Режим спецуборки отключён. Подсчёт пошёл.',
			'✨ Чистота достигнута. Счётчики ожили.',
			'🤢 Пережил уборку? Молодец. Учёт включён.',
			'😹 Всё, хватит геройствовать. Счётчики считают.',
			'🚀 Уборка завершена. Лётчики счётчиков на постах.',
			'🛎 Лоток готов к новым подвигам котов. Считаем!',
			'📅 Новая глава — теперь считаем заново.',
			'🍺 Можно и отдохнуть. Счётчики пашут.',
			'💩 Конец битвы с кучами. Учёт пошёл!',
			'🧼 Закончил чистить — теперь наблюдаем за срачем.',
		],
	},

	resetCounter: [
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
		'🤢 {name} снова нюхал порох… ой, то есть лоток.',
		'💩 {name} победил говно-босса. +100 к уважению!',
		'😹 {name}, держи медаль "Герой совка".',
		'🔥 {name} зачистил поле боя. Коты ликуют.',
		'⚡ {name} разогнал вонищу быстрее молнии.',
		'🥇 {name} вошёл в зал славы уборщиков!',
		'🍻 {name}, после такого пивас заслужен.',
		'🪖 {name} провёл спецоперацию "Чистый лоток".',
		'🕵️ {name} уничтожил все улики котячего преступления.',
		'😼 {name}, коты уже строят тебе памятник.',
		'🧨 {name} разминировал лоток. Опасная работа!',
		'😏 {name}, совок у тебя явно прокачан на +10 к ловкости.',
		'🛠️ {name} провёл техобслуживание котячего туалета.',
		'🌪️ {name} устроил генеральную — ни комка не осталось.',
		'🤡 {name}, коты смотрят и ржут: ну наконец-то!',
		'🎯 {name} попал точно по цели — всё убрано.',
		'🧙 {name} сотворил магию чистоты. Лоток сияет.',
		'🐾 {name} убрал за котами, а коты уже планируют реванш.',
		'🥵 {name} вспотел, но лоток довёл до идеала.',
		'📦 {name} вынес "подарочки". Коты благодарны… наверное 😼',
	],

	counterReminder: [
		'📈 Вот это они насрали!\n\n{litters}\n\nСовок в руки и вперед 😺',
		'📈 Котики сегодня активны!\n\n{litters}\n\nПора навести чистоту 🧹✨',
		'🐾 Много следов в лотке!\n\n{litters}\n\nЛучше прибраться 🧼',
		'🧻 Лоток используется часто:\n\n{litters}\n\nМожет, пора убраться?',
		'😺 Кажется, лоток зовёт тебя!\n\n{litters}\n\nВремя уборки 🧹',
		'🚽 Лоточек уже заждался чистки!\n\n{litters}\n\nПора заняться делом 💪',
		'💩 Следы миссии котиков обнаружены!\n\n{litters}\n\nПора к делу 🧹',

		'🤢 Аромат пошёл гулять по квартире…\n\n{litters}\n\nБери совок скорее!',
		'⚠️ Перегрузка лотка!\n\n{litters}\n\nНужен срочный вывоз отходов.',
		'🔥 Срочно на поле боя!\n\n{litters}\n\nКоты оставили вызов.',
		'🕵️ Следствие ведут котики:\n\n{litters}\n\nПодозреваемый — ты, убирай.',
		'😼 Лоток на грани бунта!\n\n{litters}\n\nПора усмирить котиков.',
		'💀 Ещё немного — и лоток оживёт.\n\n{litters}\n\nСпаси ситуацию!',
		'📊 Статистика пугает:\n\n{litters}\n\nСовок нужен немедленно!',
		'🪣 Совочек грустит без дела…\n\n{litters}\n\nСрочно порадуй его.',
		'🚨 Красный уровень насратости!\n\n{litters}\n\nВремя уборки!',
		'😹 Коты устроили вечеринку.\n\n{litters}\n\nТеперь твоя очередь.',
		'🐕 Это точно не собаки…\n\n{litters}\n\nКотики ждут чистоты!',
		'🤡 Лоток смеётся над тобой.\n\n{litters}\n\nПокажи, кто тут главный.',
		'🧨 Обнаружено скопление комков!\n\n{litters}\n\nЛиквидируй немедленно.',
		'🌪️ Шторм активности котов:\n\n{litters}\n\nСовок к бою!',
		'🍺 Это уже не лоток, а бар.\n\n{litters}\n\nЗакрывай заведение!',
		'🛎 Коты позвонили в сервис.\n\n{litters}\n\nТы — уборщик!',
		'😏 Давай, герой…\n\n{litters}\n\nКоты смотрят и ждут.',
		'📦 Новая партия "подарков".\n\n{litters}\n\nВыноси скорее!',
		'🎯 Попадание по мишени.\n\n{litters}\n\nТеперь твоя цель — совок.',
		'🤖 Даже робот бы сдался.\n\n{litters}\n\nНо ты справишься.',
		'🧙 Магия навоза в действии.\n\n{litters}\n\nРазвей чары уборкой.',
		'👃 Запах намекает:\n\n{litters}\n\nИгнорировать уже не получится.',
		'📢 Срочное объявление:\n\n{litters}\n\nКто-то обязан убрать СЕЙЧАС.',
		'😼 Заговор котов!\n\n{litters}\n\nТвоя миссия — разогнать шайку.',
		'🎭 Лоток устроил спектакль.\n\n{litters}\n\nСними его с постановки.',
		'🛑 Лимит насратости превышен.\n\n{litters}\n\nТребуется уборка.',
		'💌 Котики написали письмо:\n\n{litters}\n\n"Пожалуйста, убери насранное".',
	],

	timeReminder: [
		'⏳ Прошло {hours} ч с последней уборки. Мяу, пора заглянуть к лоточку 🐱',
		'🕒 Уже {hours} часов без уборки. Котики ждут чистоту 🐾',
		'⌛ {hours} ч без уборки — пора порадовать котиков!',
		'😺 Котики шепчут: прошло {hours} ч… Пора навести порядок 🧹',
		'🐾 {hours} часов котики терпят… сделай им приятно и убери 💖',
	],

	lastClean: ({ user, time }) => `🕒 Последний раз убирался ${user}\n📅 ${time}`,

	counterStatus: litters => `📊 Счётчик посещений лотка:\n\n${litters}`,
};

const randomText = (arr, vars = {}) => {
	let text = arr[Math.floor(Math.random() * arr.length)];
	Object.entries(vars).forEach(([k, v]) => {
		text = text.replace(`{${k}}`, v);
	});
	return text;
};

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
			? randomText(Messages.cleaningMode.on, { name: userName })
			: randomText(Messages.cleaningMode.off, { name: userName });
		await this.sendBroadcastMessage({ text });
	}

	async sendLastCleanMessage(user) {
		const lastClean = await getLastClean();
		const text = Messages.lastClean({
			user: lastClean.name || 'кто-то',
			time: lastClean.clean_time,
		});
		await this.bot.sendMessage(user.tg_id, text);
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
		const text = randomText(Messages.resetCounter, { name });
		await this.sendBroadcastMessage({ text });
	}

	async sendBroadcastTimeReminder(hours) {
		const text = randomText(Messages.timeReminder, { hours: Math.floor(hours) });
		await this.sendBroadcastMessage({ text });
	}

	async sendBroadcastCounterReminder(litters) {
		const littersString = litters.map(l => `${l.name}: ${l.value}`).join('\n');
		const text = randomText(Messages.counterReminder, { litters: littersString });
		await this.sendBroadcastMessage({ text });
	}

	async sendRegistration({ chatId, text }) {
		if (this.chatStates[chatId] === ChatStates.WAIT_CODE) {
			if (text === ACCESS_CODE) {
				this.chatStates[chatId] = ChatStates.ASK_NAME;
				await this.bot.sendMessage(chatId, randomText(Messages.registration.codeAccepted));
			} else {
				await this.bot.sendMessage(chatId, randomText(Messages.registration.codeRejected));
			}
			return;
		}

		if (this.chatStates[chatId] === ChatStates.ASK_NAME) {
			await addUser(chatId, text);
			delete this.chatStates[chatId];
			await this.sendMainMenu(chatId);
			return;
		}

		await this.bot.sendMessage(chatId, randomText(Messages.registration.alreadyRegistered));
	}

	async sendMessageWithMenu(chatId, text = '📋 Меню:') {
		await this.bot.sendMessage(chatId, text, this.buildMenu());
	}

	async sendMainMenu(chatId) {
		await this.bot.sendMessage(chatId, '⬇️ Выбери, что сделать дальше:', this.buildMenu());
	}
}
