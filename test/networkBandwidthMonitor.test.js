var networkBandwidthMonitor = require('../lib/networkBandwidthMonitor.js');
var should = require('should');

describe('Network bandwidth monitor test', function() {
	it('should record network throughput', function(done) {
		networkBandwidthMonitor.start(function() {
			setTimeout(function() {
				networkBandwidthMonitor.stop(function(data) {
					should.exist(data);
					var uploadThroughput = parseFloat(data.uploadThroughput);
					var downloadThroughput = parseFloat(data.downloadThroughput);
					console.log('uploadThroughput: ' + uploadThroughput + ' '
							+ data.units);
					console.log('downloadThroughput: ' + downloadThroughput
							+ ' ' + data.units);
					should.exist(uploadThroughput);
					should.exist(downloadThroughput);
					done();
				});
			}, 5000);
		});
	});
});
