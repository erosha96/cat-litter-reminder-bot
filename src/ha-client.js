import axios from 'axios';

const URL = process.env.HA_URL;
const TOKEN = process.env.HA_TOKEN;

export class HaClient {
	async resetCounter() {
		try {
			const { data } = await axios.post(
				`${URL}/api/services/input_button/press`,
				{ entity_id: 'input_button.all_litters_reset' },
				{
					headers: {
						Authorization: `Bearer ${TOKEN}`,
						'Content-Type': 'application/json',
					},
				}
			);
			console.log('Кнопка нажата, ответ HA:', data);
		} catch (error) {
			console.error('Ошибка при нажатии кнопки:', error.message);
		}
	}

	async getStates(entityIds) {
		const getLitterState = async entityId => {
			const { data } = await axios.get(`${URL}/api/states/${entityId}`, {
				headers: { Authorization: `Bearer ${TOKEN}` },
			});
			return { count: data.state, entityId };
		};

		try {
			const states = await Promise.all(entityIds.map(getLitterState));
			return states;
		} catch (error) {
			console.error('Ошибка при получении состояний:', error.message);
			return [];
		}
	}
}
