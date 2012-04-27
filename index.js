var fs = require('fs');
var path = require('path');
var common = require('common');
var crypto = require('crypto');
var ujs = require('uglify-js');
var zlib = require('zlib');
var trees = require('./trees');

var enoent = function(message) {
	var err = new Error(message);

	err.code = 'ENOENT';
	return err;
};
var md5 = function(str) {
	return crypto.createHash('md5').update(str).digest('hex');
};
var minify = function(source) {
	try {
		source = ujs.uglify.gen_code(ujs.uglify.ast_squeeze(ujs.uglify.ast_mangle(ujs.parser.parse('(function(){\n'+source+'\n})'))));
		return source.substring(12, source.length-2).trim();
	} catch (err) {
		return source;
	}
};

var REX_SOURCE = fs.readFileSync(__dirname+'/rex.js', 'utf-8');
var REX_SOURCE_MIN = minify(REX_SOURCE).replace(/<\/script>/g, '<\\\/script>');

module.exports = function(root, options) {
	if (typeof root === 'object') {
		options = root;
		root = '.';
	}

	var filename = root && /\.js$/.test(root) && root;

	options = options || {};
	options.root = !filename && (options.root || root || '.');
	options.dependencies = options.dependencies || {};
	options.cache = options.cache !== false;	

	var urls = Object.keys(options.dependencies).map(function(key) {
		return options.dependencies[key];
	}).filter(function(url) {
		return typeof url === 'string';
	});

	var parse = trees(options);	
	var boiler = options.minify ? REX_SOURCE_MIN : REX_SOURCE;
	var cache = options.cache && {};

	var middleware = function(req, res, next) {
		var url = filename || path.normalize('/'+req.url.split('?')[0]).substr(1);

		requestify(url, function(err, result) {
			if (err) return next(err.code === 'ENOENT' ? null : err);

			if (req.headers['if-none-match'] === result.etag) {
				res.statusCode = 304;
				res.end();
				return;
			}

			var gzip = /(^|\,)gzip(\,|$)/.test(req.headers['accept-encoding'] || '') && result.gzip;
			var buf = gzip || result.buffer;

			res.statusCode = 200;
			res.setHeader('ETag', result.etag);
			res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
			if (gzip) res.setHeader('Content-Encoding', 'gzip');
			res.setHeader('Content-Length', buf.length);
			res.end(buf);
		});
	};
	var requestify = function(url, callback) {
		compile(url, function(err, src, result) {
			if (err || result.gzip) return callback(err, result);

			result.etag = '"'+result.hash+'"';
			result.buffer = new Buffer(result.src);

			if (result.ongzip) return result.ongzip.get(callback);

			result.ongzip = common.future();
			result.ongzip.get(callback);

			zlib.gzip(result.buffer, function(err, zipped) {
				result.gzip = zipped;
				result.ongzip.put(null, result);
			});
		});
	};
	var wrap = function(mod) {
		var requires = {};
		var src = (options.minify ? minify(mod.source) : mod.source)+'\n//@ sourceURL='+mod.name;

		Object.keys(mod.dependencies).forEach(function(req) {
			requires[req] = mod.dependencies[req].id;
		});
		return 'rex("'+mod.id+'",'+JSON.stringify(requires)+','+JSON.stringify(src)+');';
	};
	var stringify = function(file, tree, filter) {
		var result = '';

		trees.visit(tree, function(mod) {
			if (filter[mod.id]) return;
			result += wrap(mod)+'\n';
		});

		if (options.main && options.main !== file) return result+'rex.run("'+tree.id+'");\n';
		return boiler+'\n'+result+'rex.run("'+tree.id+'",'+JSON.stringify(urls)+');\n';
	};
	var compile = function(url, callback) {
		if (cache && cache[url]) return callback(null, cache[url].src, cache[url]);

		var filter = {};

		common.step([
			function(next) {
				if (options.main && url !== options.main) {
					parse(options.main, next);
				} else {
					next();
				}
			},
			function(main, next) {
				if (main) {
					trees.visit(main, function(mod) {
						filter[mod.id] = 1;
					});
				}
				parse(url, next);
			},
			function(tree) {
				var result = {};

				result.src = stringify(url, tree, filter);
				result.hash = md5(result.src);

				if (!cache) return callback(null, result.src, result);

				cache[url] = result;
				trees.watch(tree, function() {
					delete cache[url];
				});

				callback(null, result.src, result);
			}
		], callback);
	};

	return function(req, res, next) {
		return (typeof req === 'string') ? compile(req, res) : middleware(req, res, next);
	};
};