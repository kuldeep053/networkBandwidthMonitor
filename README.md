networkBandwidthMonitor is a utility module which provides simple and straight-forward way to record network bandwidth of a machine over a period of time.
```
var networkBandwidthMonitor = require('../lib/networkBandwidthMonitor.js');
networkBandwidthMonitor.start(function() {
	setTimeout(function() {
		networkBandwidthMonitor.stop(function(data) {
			var uploadThroughput = parseFloat(data.uploadThroughput);
			var downloadThroughput = parseFloat(data.downloadThroughput);
			done();
		});
	}, 5000);
});
```
The code above records network throughput over a period of 5 seconds. `start` function starts recording and `stop` function stops the recording and returns throughput in following format:
```
{msg: 'throughput', uploadThroughput: value, downloadThroughput: value, units: 'bytes/sec'}
```
