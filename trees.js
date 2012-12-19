var common = require('common');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var detective = require('detective');
var findModule = require('find-module');

var MODULE_FOLDERS = 'browser_modules js_modules node_modules'.split(' ');

var md5 = function(str) {
	return crypto.createHash('md5').update(str).digest('hex');
};

var resolve = function(url, options, callback) {
	var source;

	if (typeof url === 'function') {
		source = url.toString().replace(/^[^\{]*\{/g, '').replace(/\}\s*$/g, '');
		url = process.cwd()+'/--source.js';
	}

	var cache = {};
	var roots = path.dirname(url).split('/');

	var hideRoot = function(path) {
		path = path.split('/');

		for (var i = 0; i < roots.length; i++) {
			if (path[0] === roots[i]) {
				path.shift();
			} else {
				path.unshift('..');
			}
		}
		return path.join('/');
	};
	var readFile = function(url, callback) {
		if (/--source.js$/.test(url)) return callback(null, source);
		return fs.readFile(url, 'utf-8', callback);
	};
	var resolveFile = function(url, callback) {
		if (!url) return callback(null, null);
		if (cache[url]) return callback(null, cache[url]);

		var cwd = path.dirname(url);
		var mod = cache[url] = {url: url, name: hideRoot(url)};
		var reqs;

		common.step([
			function(next) {
				readFile(url, next);
			},
			function(source, next) {
				mod.dependencies = {};
				mod.source = source;
				mod.id = md5(url);

				if(path.extname(url) === '.json') {
					try {
						var json = JSON.stringify(JSON.parse(mod.source));
						mod.source = common.format('module.exports = {0};', json);
					} catch (err) {
						return callback(err);
					}

					return callback(null, mod);
				}

				reqs = parser.requires(source);

				if (!reqs.length) return callback(null, mod);

				reqs.forEach(function(req, i) {
					if (options.dependencies[req]) return next.parallel()();

					var parallel = next.parallel();
					findModule(req, { dirname: cwd, modules: MODULE_FOLDERS }, function(err, filename) {
						if (err && err.code === 'ENOENT') return parallel(null, null);
						if (err) return parallel(err);
						parallel(null, filename);
					});
				});
			},
			function(deps, next) {
				deps.forEach(function(dep) {
					resolveFile(dep, next.parallel());
				});
			},
			function(deps) {
				deps.forEach(function(dep, i) {
					if (!dep) return;
					mod.dependencies[reqs[i]] = dep;
				});

				callback(null, mod);
			}
		], callback);
	};

	resolveFile(url, callback);
};
var parser = function(options) {
	options = options || {};
	options.dependencies = options.dependencies || {};

	return function(url, callback) {
		common.step([
			function(next) {
				if (typeof url === 'function') return next(null, url);
				fs.realpath(url, next);
			},
			function(url, next) {
				resolve(url, options, next);
			},
			function(tree) {
				callback(null, tree);
			}
		], callback);
	};
};

parser.requires = detective;
parser.visit = function(tree, fn) {
	var visited = {};
	var visit = function(tree, parent) {
		if (visited[tree.id]) return;
		visited[tree.id] = true;
		fn(tree, parent);

		Object.keys(tree.dependencies).forEach(function(key) {
			visit(tree.dependencies[key], tree);
		});
	};
	var first = function(tree) {
		visit(tree, null);
	};

	if (Array.isArray(tree)) return tree.forEach(first);
	first(tree);
};

module.exports = parser;