(function() {
	if (typeof rex !== 'undefined') return;

	var __compile__ = function(module, exports, require) {
		if (typeof module.source === 'function') return module.source(module, exports, require);
		eval('(function(){ '+module.source+'\n})')();		
	};

	(function() {
		var modules = {};
		var setup = function(id, deps) {
			setup = function() {};

			for (var i = 0; i < deps.length; i++) {
				document.write('<script src="'+deps[i]+'"><\/script>\n');
			}
			if (deps.length) {
				document.write('<script>rex.run("'+id+'");<\/script>');
				return true;				
			}
		};
		var populated = function(obj) {
			if (typeof obj === 'function') return obj;
			for (var i in obj) return obj;
			return false;
		};
		var requirer = function(mod) {
			return function(id) {
				var result = resolve(id, mod);

				for (var i = 1; i < arguments.length; i++) {
					resolve(arguments[i], mod);
				}
				return result;
			};
		};
		var global = function(name) {
			return name && window[name.split('/').pop()];			
		};
		var resolve = function(name, mod) {
			var req = modules[mod.requires[name]];

			if (!req && global(name)) return global(name);
			if (!req) return null;
			if (req.exports) return req.exports;

			req.name = name;

			__compile__(req, req.exports = {}, requirer(req));
			return req.exports = (populated(req.exports) || global(name) || mod.exports);
		};

		rex = function(id, requires, source) {
			modules[id] = modules[id] || {requires: requires, source: source, browser: true};
		};
		rex.run = function(id, deps, global) {
			if (setup(id, deps || [])) return;
			__compile__(modules[id], {}, requirer(modules[id]));
		};
		require = function(name) {
			for (var i in modules) {
				if (modules[i].name === name) return modules[i].exports;
			}
			return global(name);
		};
	}());
}());