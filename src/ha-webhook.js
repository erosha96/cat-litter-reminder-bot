import express from 'express';
import bodyParser from 'body-parser';

export class HaWebhook {
	constructor() {
		const port = 8124;
		this.app = express();
		this.app.use(bodyParser.json());
		this.app.post('/ha', async (req, res) => {
			try {
				const { type } = req.body || {};
				if (type === 'counter_incremented') {
					await this.onIncrement();
				}
				if (type === 'counter_reset') {
					await this.onReset();
				}
				if (type === 'clean_mode') {
					const { enabled, silent = false } = req.body || {};
					await this.onCleanModeChange(enabled, { silent });
				}
				res.sendStatus(200);
			} catch (e) {
				console.error(e);
				res.sendStatus(500);
			}
		});

		this.app.listen(port, () => {
			console.log(`HA Webhook listening on port ${port}`);
		});

		this.onIncrement = () => {};
		this.onReset = () => {};
		this.onCleanModeChange = () => {};
	}
}
