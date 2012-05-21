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
		var padding = options.minify ? '' : '\t';

		src = options.eval !== false ? JSON.stringify(src) : 'function(module, exports, require) {\n'+padding+src.split('\n').join('\n'+padding)+'\n}';

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
		return boiler+'\n'+result+'rex.run("'+tree.id+'",'+JSON.stringify(urls)+');\n';
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