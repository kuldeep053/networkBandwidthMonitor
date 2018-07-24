/* To use this uitility please follow the below steps:
 1. Fork this module eg var networkMonitorUtils = cp.fork('node_modules/networkBandwidthMonitor/lib' + '/networkMonitorUtils');
 2. To start/stop the network monitor use networkMonitorUtils.send(IPC message);
 3. The utility sends throughput back to the calling proces on receiving a stop message
 IPC Message Format:
 {msg: 'start/stop/throughput', uploadThroughput: value, downloadThroughput: value, units: 'bytes/sec'}
 Message to start network monitor(From: Calling process, To: networkMonitorUtils process):
 {msg: 'start', duration: 'in secs'}
 Note: duration is optional, if not specified network monitor will record data until stop is called or networkMonitorTimeOutWin/networkMonitorTimeOutMac expires
 Message to stop network monitor(From: Calling process, To: networkMonitorUtils process):
 {msg: 'stop'}
 Message to send throughput(From: networkMonitorUtils process, To: Calling process):
 {msg: 'throughput', uploadThroughput: value, downloadThroughput: value, units: 'bytes/sec'}
 */
var spawn = require('child_process').spawn;
var moment = require('moment');
var async = require('async');
var fs = require('fs-extra');

var throughput = {};
throughput.upload = 0;
throughput.download = 0;
throughput.units = 'bytes/sec';
var stopMonitor = false;
var networkMonitorTimeOutWin = 30 * 60 * 2; //2 hrs
var networkMonitorTimeOutMac = 60000 * 60 * 2; //2 hrs
var networkMonitorTimeOut;
var winDataCounterLimit = 4294967296; //4 GB
var actualBytesRecv = 0;
var actualBytesSent = 0;
const netmonLog = 'networkmonitor.log';

function log_to_file(message) {
    fs.appendFileSync(netmonLog, message + '\n');
}


var computeThroughput = function (bytesReceived, bytesSent, startTime, callback) {
    var monitorStopTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
    var timeInterval = moment(monitorStopTime).diff(startTime, 'seconds');
    log_to_file('Recording time: ' + timeInterval + ' secs');
    if (timeInterval != 0) {
        throughput.upload = (bytesSent / timeInterval).toFixed(2);
        throughput.download = (bytesReceived / timeInterval).toFixed(2);
    }
    callback('success');
};

var processNetstatResponseForWin = function (data, callback) {
    var bytes = {};
    bytes.recv = -1;
    bytes.sent = -1;
    var textChunk = data.toString('utf8');
    textChunk = textChunk.replace(/\s\s+/g, ' ');
    var arr = textChunk.split(" ");
    bytes.recv = parseInt(arr[5], 10);
    bytes.sent = parseInt(arr[6], 10);
    callback(bytes);
};

var processNetstatResponseForMac = function (data, callback) {
    var bytes = {};
    bytes.recv = -1;
    bytes.sent = -1;
    var textChunk = data.toString('utf8');
    textChunk = textChunk.replace(/\s\s+/g, ' ');
    var arr = textChunk.split(" ");
    if (arr[1] != 'input') {
        bytes.recv = parseInt(arr[3], 10);
        bytes.sent = parseInt(arr[6], 10);
    }
    callback(bytes);
};

var winDataCounterResetOperation = function (oldBytes, newBytes, callback) {
    var actualBytes = (winDataCounterLimit - oldBytes) + newBytes; //Note: 32bit netstat counter resets itself after 4GB in Win
    callback(actualBytes);
};

var computeBytesTransferredForWin = function (oldBytes, newBytes, callback) {
    var actualBytesTransferred = -1;
    if (newBytes >= oldBytes) {
        actualBytesTransferred = newBytes - oldBytes;
        callback(actualBytesTransferred);
    }
    else if (newBytes < oldBytes) {
        winDataCounterResetOperation(oldBytes, newBytes, function (bytesRecv) {
            actualBytesTransferred = bytesRecv;
            callback(actualBytesTransferred);
        })
    }
};

var getNetworkDataForWin = function (callback) {
    var callBackData = {};
    var completeData = '';
    callBackData.bytesReceived = -1;
    callBackData.bytesSent = -1;
    child = spawn('cmd', ['/c', 'netstat', '-e']);
    child.stdout.on('data', function (data) {
        completeData += data;
    });
    child.stdout.on('end', function () {
        processNetstatResponseForWin(completeData, function (bytes) {
            callBackData.bytesReceived = bytes.recv;
            callBackData.bytesSent = bytes.sent;
        });
    });
    child.stderr.on('data', function (data) {
        log_to_file('stderr: ' + data);
    });

    child.on('close', function (code) {
        //log_to_file('netstat child process exited with code ' + code);
        callback(null, callBackData);
    });
};

var calculateNetworkThroughputForMac = function (startTime, callback) {
    child = spawn('netstat', ['2']);
    child.stdout.on('data', function (data) {
        if (stopMonitor == true) {
            log_to_file('StopMonitor: Kill netstat process');
            child.stdin.pause();
            child.kill();
        }
        else {
            if (networkMonitorTimeOut === 0) {
                stopMonitor = true;
                log_to_file('TimeOut');
            }
            networkMonitorTimeOut--;
            processNetstatResponseForMac(data, function (bytes) {
                if (bytes.recv != -1 && bytes.sent != -1) {
                    actualBytesRecv += bytes.recv;
                    actualBytesSent += bytes.sent;
                    log_to_file('\nTotal bytes received: ' + actualBytesRecv);
                    log_to_file('Total bytes sent: ' + actualBytesSent);
                    computeThroughput(actualBytesRecv, actualBytesSent, startTime, function (result) {
                        log_to_file('Current upload throughput: ' + throughput.upload + ' bytes/sec');
                        log_to_file('Current download throughput: ' + throughput.download + ' bytes/sec');
                    });
                }
            });
        }
    });

    child.stderr.on('data', function (err) {
        log_to_file('stderr: ' + err);
        callback(err);
    });

    child.on('close', function (code) {
        //log_to_file('netstat child process exited with code: ' + code);
        callback(null);
    });
};

var startMonitoring = function (callback) {
    var newBytesRecvCount = -1;
    var newBytesSentCount = -1;
    var oldBytesRecvCount = -1;
    var oldBytesSentCount = -1;
    stopMonitor = false;
    throughput.upload = 0;
    throughput.download = 0;
    actualBytesRecv = 0;
    actualBytesSent = 0;
    log_to_file('Network Monitor Starting ...');
    var monitorStartTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
    log_to_file('Start time: ' + monitorStartTime);
    if (process.platform === 'win32') {
        async.until(function () {
            return networkMonitorTimeOut === 0;
        }, function (until_callback) {
            if (stopMonitor == true) {
                networkMonitorTimeOut = 0;
            }
            else {
                async.waterfall([
                    function (waterfall_callback) {
                        getNetworkDataForWin(function (err, data) {
                            if (err) {
                                return waterfall_callback(err);
                            }
                            waterfall_callback(null, data);
                        });
                    },
                    function (data, waterfall_callback) {
                        try {
                            if (data.bytesReceived != -1 && data.bytesSent != -1) {
                                if (oldBytesRecvCount == -1 && oldBytesSentCount == -1) {
                                    oldBytesRecvCount = data.bytesReceived;
                                    oldBytesSentCount = data.bytesSent;
                                }
                                newBytesRecvCount = data.bytesReceived;
                                newBytesSentCount = data.bytesSent;
                                computeBytesTransferredForWin(oldBytesRecvCount, newBytesRecvCount, function (bytesTransferred) {
                                    actualBytesRecv += bytesTransferred;
                                });
                                computeBytesTransferredForWin(oldBytesSentCount, newBytesSentCount, function (bytesTransferred) {
                                    actualBytesSent += bytesTransferred;
                                });
                                log_to_file('\nTotal bytes received: ' + actualBytesRecv);
                                log_to_file('Total bytes sent: ' + actualBytesSent);
                                computeThroughput(actualBytesRecv, actualBytesSent, monitorStartTime, function (result) {
                                    log_to_file('Current upload throughput: ' + throughput.upload + ' bytes/sec');
                                    log_to_file('Current download throughput: ' + throughput.download + ' bytes/sec');
                                });
                                oldBytesRecvCount = newBytesRecvCount;
                                oldBytesSentCount = newBytesSentCount;
                            }
                            networkMonitorTimeOut--;
                            return waterfall_callback(null);
                        }
                        catch (e) {
                            return waterfall_callback(e);
                        }
                    }
                ], function (err) {
                    if (err) {
                        return until_callback(err);
                    }
                    setTimeout(function () {
                        return until_callback(null);
                    }, 2000);
                });
            }
        }, function (err) {
            if (err) {
                return callback(err);
            }
            return callback(null);
        });
    }
    else {
        calculateNetworkThroughputForMac(monitorStartTime, function (err) {
            if (err) {
                return callback(err);
            }
            return callback(null);
        });
    }
};

process.on('message', function (data) {
    if (data.msg == 'start') {
        if (typeof data.duration !== 'undefined' && data.duration) {
            networkMonitorTimeOut = data.duration / 2;
        }
        else {
            if (process.platform === 'win32')
                networkMonitorTimeOut = networkMonitorTimeOutWin;
            else
                networkMonitorTimeOut = networkMonitorTimeOutMac;
        }
        startMonitoring(function (err) {
            if (err) {
                log_to_file('\nError occurred in Network Monitor!');
            }
            log_to_file('\nNetwork Monitor Stopped!');
        });
    }
    else if (data.msg == 'stop') {
        stopMonitor = true;
        process.send({
            msg: 'throughput',
            uploadThroughput: throughput.upload,
            downloadThroughput: throughput.download,
            units: throughput.units
        });
    }
});