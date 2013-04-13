var dgram = require("dgram");
var lib = require('./lib.js');
var Pool = require('./pool.js');
var pingSession = require('net-ping').createSession({
	retries: 1,
	timeout: 500,
	packetSize: 64
});
var parse = require('./parser.js');

var kUpstreamDNS = ['8.8.8.8', '114.114.114.114'];
var kTimeout = 5000;

var server = dgram.createSocket("udp4");
var client = dgram.createSocket("udp4");

var quires = {};
var clientPool = new Pool(40, function(id) {
	var entry = quires[id];
  if (entry === undefined) {
    console.error('%d expired.', id);
    return;
  }
	var channel = -1;
  for (var i = 0; i < 2; i++)
    if (entry.results[i] === undefined) {
      channel = i;
      break;
    }
  if (channel === -1) {
    console.error("DUP in clientPool");
    return;
  }
  client.send(entry.buf, 0, entry.buf.length, 53, kUpstreamDNS[channel]);
  entry.results[channel] = null;
});

var IPCache = {};
var pingPool = new Pool(80, function(ip) {
	var entry = IPCache[ip];
	entry.startTime = Date.now();
	pingSession.pingHost(ip, pingHandler);
});

function pingIP(id, ip) {
	if (IPCache.hasOwnProperty(ip)) {
		if (IPCache[ip] instanceof Array)
			IPCache[ip].push(id);
		else // this case the ping result will be stored in IPCache[ip];
			handlePingResult(id, ip, IPCache[ip]);
		return;
	}
	IPCache[ip] = [id];
	pingPool.process(ip);
}

function pingHandler(err, ip) {
	pingPool.release();
	var entry = IPCache[ip];
	if (err) {
		if (entry.retries === undefined)
			entry.retries = 0;
		if (++entry.retries < 2) {
			pingPool.process(ip);
			return;
		}
		// mark target ip unreachable.
		IPCache[ip] = Number.MAX_VALUE;
	} else {
		IPCache[ip] = Date.now() - entry.startTime;
	}
	for (var i = 0; i < entry.length; i++)
		handlePingResult(entry[i], ip, IPCache[ip]);
}

function handlePingResult(id, ip, delay) {
	// drop the result, if the query is expired.
	if (!quires.hasOwnProperty(id))
		return;
	var entry = quires[id];
	// drop the result, if the query is answered.
	if (entry.answered)
		return;
	var channel = entry.ips.indexOf(ip);
	if (channel == -1) {
		console.error('Never queried this ip %s', ip);
		return;
	}
	entry.delays[channel] = delay;
	if (entry.delays[channel ^ 1] !== undefined) {
		if (entry.delays[channel] < entry.delays[channel ^ 1])
			sendResponse(id, channel);
		else
			sendResponse(id, channel ^ 1);
	}
}

function sendResponse(id, channel) {
  console.log("%d answered by %s", id, kUpstreamDNS[channel]);
	var entry = quires[id];
	server.send(entry.results[channel], 0, entry.results[channel].length,
			entry.from.port, entry.from.address);
	entry.answered = true;
}

setInterval(function() {
  var now = Date.now();
  for (var id in quires) {
    var entry = quires[id];
    if (entry.timeout >= now) {
      if (!entry.answered) {
        clientPool.release();
        var hasDelayResult = false;
        for (var i = 0; i < 2; i++)
          if (entry.delays[i] > 0) {
            hasDelayResult = true;
            sendResponse(id, i);
            break;
          }
        if (!hasDelayResult) {
          for (var i = 0; i < 2; i++)
            if (entry.results[i]) {
              sendResponse(id, i);
              break;
            }
        }
      }
      delete quires[id];
    }
  }
}, kTimeout * 2);

client.on('message', function(buf, from) {
	clientPool.release();
	var msg = parse(buf);
  // console.log("Answer: ", msg);
	var entry = quires[msg.id];
	if (entry === undefined) {
		console.error('Never met %d from %s', msg.id, from.address);
		return;
	}
	var channel = kUpstreamDNS.indexOf(from.address);
	if (channel == -1) {
		console.error('Message from unknown source %s', from.address);
		return;
	}
	entry.results[channel] = buf;
	if (entry.bypass) {
		sendResponse(msg.id, channel);
		return;
	}
	if (entry.results[channel ^ 1]) {
		// another result already arrived.
		var keys = entry.results.map(function(result) {
			var key = 0;
			parse(result).answers.forEach(function(answer) {
				key ^= answer.ip;
			});
			return key;
		});
		if (key[0] == key[1]) {
			// identical results;
			sendResponse(msg.id, channel);
			return;
		}
	}
  if (msg.answers.length) {
    var ip = lib.toIPv4(msg.answers.random().ip);
    entry.ips[channel] = ip;
    pingIP(msg.id, ip);
  } else {
    entry.ips[channel] = null;
  }
  if (entry.ips[channel ^ 1] === null)
    sendResponse(msg.id, channel);
});

server.on("message", function(buf, from) {
  var msg = parse(buf);
  console.log("%d Asked %s by %s:%d", msg.id, msg.questions[0].name, from.address, from.port);
  var entry = {
    buf: buf,
    from: from,
    results: new Array(2),
    ips: new Array(2),
    delays: new Array(2),
    timeout: Date.now() + kTimeout
  };
  quires[msg.id] = entry;
  if (!msg.questions.some(function(question) { return question.type == 0x01; }))
    entry.bypass = true;
  else
    clientPool.process(msg.id);
  clientPool.process(msg.id);
});

client.bind();
server.bind(53);
