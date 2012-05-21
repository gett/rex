var common = require('common');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var MODULE_FOLDERS = 'browser_modules js_modules node_modules'.split(' ');
var WATCH_OPTIONS = {interval: 100, persistent: false};

var md5 = function(str) {
	return crypto.createHash('md5').update(str).digest('hex');
};
var ext = function(name) {
	return name.replace(/\.js$/, '')+'.js';
};
var findModule = function(name, cwd, callback) {
	var files;
	var url;

	common.step([
		function(next) {
			files = Array.prototype.concat.apply([], MODULE_FOLDERS.map(function(folder) {
				folder = path.join(cwd, folder);
				return [
					path.join(folder, name, 'browser.js'),
					path.join(folder, name, 'index.js'),
					path.join(folder, name, 'package.json'),
					path.join(folder, ext(name))
				];
			}));
			files.forEach(function(file) {
				path.exists(file, next.parallel().bind(null, null));
			});
		},
		function(exists, next) {
			url = files.filter(function(_, i) {
				return exists[i];
			})[0];

			if (url && /\.json$/.test(url)) return fs.readFile(url, 'utf-8', next);
			if (url) return callback(null, url);
			if (cwd === '/') return callback(null, null);

			findModule(name, path.join(cwd, '..'), callback);
		},
		function(json) {
			try {
				json = JSON.parse(json);
			} catch (err) {
				return callback(err);
			}

			if (!json.browserify && !json.main) return callback(null, null);
			callback(null, path.join(path.dirname(url), json.browserify || json.main));
		}
	], callback);
};
var resolve = function(url, options, callback) {
	var cache = {};
	var inlined;
	var roots;

	if (typeof url === 'function') {
		inlined = url;
		url = 'source.js';
		roots = [];
	} else {
		roots = path.dirname(url).split('/');
	}

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
	var resolveFile = function(url, callback) {
		if (!url) return callback(null, null);
		if (cache[url]) return callback(null, cache[url]);

		var cwd = path.dirname(url);
		var mod = cache[url] = {url: url, name: hideRoot(url)};
		var reqs;

		common.step([
			function(next) {
				if (inlined) return next(null, inlined.toString().replace(/^[^\{]*\{/g, '').replace(/\}\s*$/g, ''));
				fs.readFile(url, 'utf-8', next);
			},
			function(source, next) {
				mod.dependencies = {};
				mod.source = source;
				mod.id = md5(url);
				mod.inlined = inlined;

				reqs = parser.requires(source);

				if (!reqs.length) return callback(null, mod);

				reqs.forEach(function(req, i) {
					if (options.dependencies[req]) return next.parallel()();
					if (req[0] === '.') return next.parallel()(null, path.join(cwd, ext(req)));
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
	options.dependencies = options.dependencies || {};

	return function(url, callback) {
		common.step([
			function(next) {
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

parser.requires = function(src) { // mainly exposed for testing...
	var strs = [];
	var modules = [];

	var save = function(_, str) {
		return strs.push(str)-1;
	};

	src = src.replace(/'((?:(?:\\')|[^'])*)'/g, save);                // save ' based strings
	src = src.replace(/"((?:(?:\\")|[^"])*)"/g, save);                // save " based strings
	src = src.replace(/(\n|^).*\/\/\s*@rex-ignore\s*(\n|$)/gi, '$1'); // remove all ignore lines
	src = src.replace(/\\\//g, '@');                                  // regexps
	src = src.replace(/\/\/.*/g, '@');                                // remove all comments
	src = src.replace(/\/\*([^*]|\*[^\/])*\*\//g, '@');               // remove all multiline comments

	// missing some lookahead / lookbehind logic here
	src.replace(/(?:^|[^\w.])require\s*\(\s*((?:\d+(?:\s*,\s*)?)+)\s*\)(?:[^\w]|$)/g, function(_, i) {
		i.split(/\s*,\s*/g).forEach(function(i) {
			if (modules.indexOf(strs[i]) > -1) return;
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

module.exports = parser;