function getBitFlag(val, offset) {
	return !!(val & (1 << offset));
}

function getRangeFlag(val, offset, size) {
	return (val >> offset) & ((1 << size) - 1);
}

function parseName(buf, offset, res) {
	var lableSize, lable;
	while ((lableSize = buf.readUInt8(offset++)) > 0) {
		if (lableSize & 0xc0) {
			var ptr = ((lableSize & 0x3f) << 8) | buf.readUInt8(offset++);
			if (ptr < offset)
				parseName(buf, ptr, res);
			return offset;
		} else {
			lable = buf.toString('ascii', offset, offset += lableSize);
			res.push(lable);
		}
	}
	return offset;
}

function parseQuestion(buf, offset, res) {
	var name = []; offset = parseName(buf, offset, name);
	var qtype = buf.readUInt16BE(offset); offset += 2;
	var qclass = buf.readUInt16BE(offset); offset += 2;
	res.push({
		name: name.join('.'),
		type: qtype,
		'class': qclass
	});
	return offset;
}

function parseAnswer(buf, offset, res) {
	var name = []; offset = parseName(buf, offset, name);
	var atype = buf.readUInt16BE(offset); offset += 2;
	var aclass = buf.readUInt16BE(offset); offset += 2;
	var ttl = buf.readUInt32BE(offset); offset += 4;
	var rdlength = buf.readUInt16BE(offset); offset += 2;

	if (atype === 0x01)
		res.push({
			name: name.join('.'),
			type: atype,
			'class': aclass,
			ttl: ttl,
			ip: buf.readUInt32BE(offset)
		});

	return offset + rdlength;
}

function parseDnsMessage(buf) {

	var offset = 0;

	var id = buf.readUInt16BE(offset); offset += 2;
	var flags = buf.readUInt16BE(offset); offset += 2;
	var qdcount = buf.readUInt16BE(offset); offset += 2;
	var ancount = buf.readUInt16BE(offset); offset += 2;
	var nscount = buf.readUInt16BE(offset); offset += 2;
	var arcount = buf.readUInt16BE(offset); offset += 2;

	var questions = [];
	var answers = [];
	// var nss = [];
	// var ars = [];

	// console.log(qdcount, ancount, nscount, arcount);

	while (qdcount-- > 0)
		offset = parseQuestion(buf, offset, questions);
	while (ancount-- > 0)
		offset = parseAnswer(buf, offset, answers);
	// while (nscount-- > 0)
	// 	offset = parseQuestion(buf, offset, nss);
	// while (arcount-- > 0)
	// 	offset = parseQuestion(buf, offset, ars);

	return {
		id: id, 
		responseCode: getRangeFlag(flags, 0, 4),
		z: getRangeFlag(flags, 4, 3),
		recursionAvailable: getBitFlag(flags, 7),
		recursionDesired: getBitFlag(flags, 8),
		truncation: getBitFlag(flags, 9),
		authoritativeAnswer: getBitFlag(flags, 10),
		opCode: getRangeFlag(flags, 11, 4),
		response: getBitFlag(flags, 15),
		questions: questions, 
		answers: answers,
		nscount: nscount,
		arcount: arcount
	};

}

// var query = 'c1590100000100000000000006676f6f676c6503636f6d0000010001';
// var response = 'c1598180000100060000000006676f6f676c6503636f6d0000010001c00c000100010000012c00044a7d1f65c00c000100010000012c00044a7d1f8bc00c000100010000012c00044a7d1f8ac00c000100010000012c00044a7d1f64c00c000100010000012c00044a7d1f71c00c000100010000012c00044a7d1f66';

// parseDnsMessage(new Buffer(query, 'hex'));
// parseDnsMessage(new Buffer(response, 'hex'));

module.exports = parseDnsMessage;
