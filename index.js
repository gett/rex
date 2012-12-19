var fs = require('fs');
var path = require('path');
var common = require('common');
var crypto = require('crypto');
var zlib = require('zlib');
var trees = require('./trees');

var REX_SOURCE = fs.readFileSync(__dirname+'/rex.js', 'utf-8');

module.exports = function(options) {
	options = options || {};
	options.dependencies = options.dependencies || {};

	var urls = Object.keys(options.dependencies).map(function(key) {
		return options.dependencies[key];
	}).filter(function(url) {
		return typeof url === 'string';
	});

	var parse = trees(options);

	var wrap = function(mod) {
		var requires = {};
		var src = mod.source+'\n//@ sourceURL='+mod.name;

		src = options.eval !== false ? JSON.stringify(src) : 'function(module, exports, require) {\n\t'+src.split('\n').join('\n\t')+'\n}';

		Object.keys(mod.dependencies).forEach(function(req) {
			requires[req] = mod.dependencies[req].id;
		});
		return 'rex("'+mod.id+'",'+JSON.stringify(requires)+','+src+');';
	};	
	var stringify = function(tree, base) {
		var result = '';
		var filter = {};
		var based = base && base.id !== tree.id;

		if (based) {
			tree.visit(base, function(mod) {
				filter[mod.id] = true;
			});
		}
		trees.visit(tree, function(mod) {
			if (filter[mod.id]) return;
			result += wrap(mod)+'\n';
		});

		if (based) return result+'rex.run("'+tree.id+'");\n';
		return REX_SOURCE+'\n'+result+'rex.run("'+tree.id+'",'+JSON.stringify(urls)+');\n';
	};

	return function(url, callback) {
		var base = options.base;

		common.step([
			function(next) {
				if (base) return parse(base, next);
				next();
			},
			function(result, next) {
				base = result;
				parse(url, next);
			},
			function(tree) {
				var result = stringify(tree, base);
				var files = [];

				trees.visit(tree, function(node) {
					files.push(node.url);
				});

				callback(null, result, files);				
			}
		], callback);
	};
};