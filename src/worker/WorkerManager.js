export default class WorkerManager {
	constructor(worker) {
		this.worker = worker;
		this.queue = [];

		this.worker.onmessage = (event) => {
			let reqData = event.data;
			let data = reqData.data;
			this.queue.forEach((item, index) => {
				if (item.id == reqData.id) {
					item.resolve(data);
					this.queue.splice(index, 1);

					// Next
					if (this.queue.length >= 1) {
						let first = this.queue[0];
						this.worker.postMessage({
							id: first.id,
							data: first.data,
						});
					}
				}
			});
		};

		this._idCounter = 0;
	}

	_execute() {
		if (this.queue.length == 0) return;

		if (this.queue.length == 1) {
			let first = this.queue[0];
			this.worker.postMessage({
				id: first.id,
				data: first.data,
			});
		}
	}

	post(data) {
		let promiseResolver;
		let promise = new Promise((resolve) => {
			promiseResolver = resolve;
		});

		this.queue.push({
			id: this._idCounter++,
			data,
			resolve: promiseResolver,
		});

		this._execute();

		return promise;
	}
}
