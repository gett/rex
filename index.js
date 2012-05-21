var fs = require('fs');
var path = require('path');
var common = require('common');
var crypto = require('crypto');
var ujs = require('uglify-js');
var zlib = require('zlib');
var trees = require('./trees');

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

module.exports = function(options) {
	options = options || {};
	options.dependencies = options.dependencies || {};

	var urls = Object.keys(options.dependencies).map(function(key) {
		return options.dependencies[key];
	}).filter(function(url) {
		return typeof url === 'string';
	});

	var parse = trees(options);	
	var boiler = options.minify ? REX_SOURCE_MIN : REX_SOURCE;

	var wrap = function(mod) {
		var requires = {};
		var src = (options.minify ? minify(mod.source) : mod.source)+'\n//@ sourceURL='+mod.name;

		src = options.eval !== false ? JSON.stringify(src) : 'function(module, exports, require) {\n\t'+src.split('\n').join('\n\t')+'\n}';

		Object.keys(mod.dependencies).forEach(function(req) {
			requires[req] = mod.dependencies[req].id;
		});
		return 'rex("'+mod.id+'",'+JSON.stringify(requires)+','+JSON.stringify(src)+');';
	};	
	var realpath = function(url, callback) {
		if (!url) return callback();
		if (url[0] === '/') return callback(null, url);
		fs.realpath(url, callback);
	};
	var stringify = function(file, tree, filter) {
		var result = '';

		trees.visit(tree, function(mod) {
			if (filter[mod.id]) return;
			result += wrap(mod)+'\n';
		});

		if (options.base && options.base !== file) return result+'rex.run("'+tree.id+'");\n';
		return boiler+'\n'+result+'rex.run("'+tree.id+'",'+JSON.stringify(urls)+');\n';
	};

	return function(url, callback) {
		var filter = {};

		common.step([
			function(next) {
				realpath(url, next.parallel());
				realpath(options.base, next.parallel());
			},
			function(arr, next) {
				url = arr[0];
				options.base = arr[1];

				if (options.base && url !== options.base) {
					parse(options.base, next);
				} else {
					next();
				}
			},
			function(base, next) {
				if (base) {
					trees.visit(base, function(mod) {
						filter[mod.id] = 1;
					});
				}
				parse(url, next);
			},
			function(tree) {
				var result = stringify(url, tree, filter);
				var files = [];

				trees.visit(tree, function(node) {
					files.push(node.url);
				});

				callback(null, result, files);
			}
		], callback);
	};
};