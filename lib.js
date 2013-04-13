var path = require('path');
var fs = require('fs');

var kRootPath = path.dirname(module.filename);

function $define(object, prototype) {
  var setterGetterPattern = /^(set|get)([A-Z])(.*)/;
  var setterGetters = {};
  for (var key in prototype) {
    var matches = setterGetterPattern.exec(key);
    if (matches) {
      var name = matches[2].toLowerCase() + matches[3];
      if (!setterGetters.hasOwnProperty(name))
        setterGetters[name] = {};
      setterGetters[name][matches[1]] = prototype[key];
    }
    Object.defineProperty(object, key, {
      value: prototype[key],
      writeable: false
    });
  }
  Object.defineProperties(object, setterGetters);
}
function $declare(object, prototype) {
  object.prototype.constructor = object;
  $define(object.prototype, prototype);
}
function $inherit(type, parent, proto) {
  type.prototype = {
    constructor: type,
    __proto__: parent.prototype
  };
  if (proto) $define(type.prototype, proto);
}

$define(global, {
  $define: $define,
  $declare: $declare,
  $inherit: $inherit
});

$define(String.prototype, {
  format: function() {
    var args = arguments;
    return this.replace(/%(([a-zA-Z]\w*)|(\d+))\b/g, function(all, key, name, index) {
      if (index !== undefined)
        return args[parseInt(index, 10)];
      for (var i = 0; i < args.length; i++)
        if (args[i].hasOwnProperty(name))
          return args[i][name];
      return '';
    });
  }
});

$define(Array.prototype, {
  random: function() {
    return this[parseInt(Math.random() * this.length, 10)];
  }
});

var opts = {}, flags = {};
(function() {

for (var i = 0, argv = process.argv.slice(2); i < argv.length; i++) {
  var name, value;
  if (argv[i].substr(0, 2) === '--') {
    var index = argv[i].indexOf('=');
    if (index > -1) {
      name = argv[i].substring(2, index);
      value = argv[i].substr(index + 1);
    } else {
      name = argv[i].substr(2);
      value = argv[++i];
    }
    opts[name] = value;
    var match = /(y|yes|true|1)|(n|no|false|0)/.exec(value);
    if (match)
      flags[name] = match[1] ? true : false;
  } else {
    opts._ = argv[i];
  }
}

})();

function toIPv4(v) {
  var parts = [];
  for (var i = 24; i >= 0; i -= 8)
    parts.push((v >>> i) & 0xff);
  return parts.join('.');
}

function parseIPv4(ip) {
  return ip.split('.').reduce(function(lhv, rhv) {
    return (lhv << 8) | parseInt(rhv, 10);
  }, 0);
}

$define(exports, {
  options: opts,
  flags: flags,
  toIPv4: toIPv4,
  parseIPv4: parseIPv4
});
