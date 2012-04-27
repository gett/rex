var common = require('common');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var MODULE_FOLDERS = 'browser_modules js_modules node_modules'.split(' ');
var WATCH_OPTIONS = {interval: 100, persistent: false};

var watching = {};
var md5 = function(str) {
	return crypto.createHash('md5').update(str).digest('hex');
};
var dotjs = function(name) {
	return name.replace(/\.js$/, '')+'.js';
};
var findModule = function(name, cwd, callback) {
	var files;

	common.step([
		function(next) {
			files = Array.prototype.concat.apply([], MODULE_FOLDERS.map(function(folder) {
				folder = path.join(cwd, folder);
				return [path.join(folder, name, 'browser.js'), path.join(folder, name, 'index.js'), path.join(folder, dotjs(name))];
			}));
			files.forEach(function(file) {
				path.exists(file, next.parallel().bind(null, null));
			});
		},
		function(exists) {
			var url = files.filter(function(_, i) {
				return exists[i];
			})[0];

			if (url) return callback(null, url);
			if (cwd === '/') return callback(null, null);

			findModule(name, path.join(cwd, '..'), callback);
		}
	], callback);
};
var resolve = function(url, options, callback) {
	var root = options.root;
	var cache = {};
	var humanify = function(path) {
		var dir = root.replace(/\/$/, '')+'/';

		if (path.indexOf(dir) === 0) return path.replace(dir, '');
		return path.replace('/index.js', '').replace('/browser.js', '').split('/').pop();
	};
	var resolveFile = function(url, callback) {
		if (!url) return callback(null, null);
		if (cache[url]) return callback(null, cache[url]);

		var cwd = path.dirname(url);
		var mod = cache[url] = {url: url, name: humanify(url)};
		var reqs;

		common.step([
			function(next) {
				fs.readFile(url, 'utf-8', next);
			},
			function(source, next) {
				mod.dependencies = {};
				mod.source = source;
				mod.id = md5(url);

				reqs = parser.requires(source);

				if (!reqs.length) return callback(null, mod);

				reqs.forEach(function(req, i) {
					if (options.dependencies[req]) return next.parallel()();
					if (req[0] === '.') return next.parallel()(null, path.join(cwd, dotjs(req)));
					findModule(req, cwd, next.parallel());
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

	resolveFile(path.join(root, url), callback);
};
var parser = function(options) {
	options = options || {};
	options.root = options.root || '.';
	options.dependencies = options.dependencies || {};

	return function(url, callback) {
		common.step([
			function(next) {
				fs.realpath(options.root, next);
			},
			function(abs, next) {
				options.root = abs;
				resolve(url, options, next);
			},
			function(tree) {
				callback(null, tree);
			}
		], callback);
	};
};

parser.requires = function(src) { // mainly exposed for testing...
	var strs = [];
	var modules = [];

	var save = function(_, str) {
		return strs.push(str)-1;
	};

	src = src.replace(/'((?:(?:\\')|[^'])*)'/g, save);                      // save ' based strings
	src = src.replace(/"((?:(?:\\")|[^"])*)"/g, save);                      // save " based strings
	src = src.replace(/(\n|^).*\/\/\s*node\s*[-]?\s*only\s*(\n|$)/g, '$1'); // remove all ignore lines
	src = src.replace(/\\\//g, '@');                                        // regexps
	src = src.replace(/\/\/.*/g, '@');                                      // remove all comments
	src = src.replace(/\/\*([^*]|\*[^\/])*\*\//g, '@');                     // remove all multiline comments

	// missing some lookahead / lookbehind logic here
	src.replace(/(?:^|[^\w.])require\s*\(\s*((?:\d+(?:\s*,\s*)?)+)\s*\)(?:[^\w]|$)/g, function(_, i) {
		i.split(/\s*,\s*/g).forEach(function(i) {
			modules.push(strs[i]);
		});
	});	

	return modules;
};
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
parser.watch = function(tree, fn) {
	parser.visit(tree, function(mod) {
		if (watching[mod.url]) return watching[mod.url].push(fn);
		watching[mod.url] = [fn];

		fs.watchFile(mod.url, WATCH_OPTIONS, function(cur, prev) {
			if (cur.mtime.getTime() === prev.mtime.getTime()) return;

			watching[mod.url].forEach(function(fn) {
				fn(mod.url);
			});
		});
	});
};

module.exports = parser;