var cp = require('child_process');
var child = cp.fork('lib' + '/networkMonitorUtils');

var uploadThroughput = -1;
var downloadThroughput = -1;

module.exports = {
	start : function(callback) {
		child.send({
			msg : 'start'
		});
		callback('success');
	},

	stop : function(callback) {
		child.send({
			msg : 'stop'
		});
		child.once('message', function(data) {
			child.kill('SIGINT');
			callback(data);
		});
	}
}