require('./lib.js');

function Pool(capacity, handler) {
	this.capacity = capacity;
	this.occupied = 0;
	this.queue = [];
	this.handler = handler;
}
$declare(Pool, {
	process: function(param) {
		if (arguments.length > 0)
			this.queue.push(param);
		if (this.occupied == this.capacity || this.queue.length === 0)
			return;
		param = this.queue.shift();
		this.occupied++;
		this.handler(param);
	},
	release: function() {
		if (this.occupied > 0)
			this.occupied--;
		this.process();
	}
});

module.exports = Pool;