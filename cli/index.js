#!/usr/bin/env node

// TODO: clean up this messy code

var argv = require('optimist')
			.alias('o', 'out')
			.alias('b', 'base')
			.alias('m', 'minify')
			.alias('h', 'help')
			.alias('w', 'watch')
			.alias('l', 'listen')
			.alias('n', 'noeval')
			.alias('s', 'source')
			.argv;

var cat = require('cat');
var rex = require('rex');
var fs = require('fs');
var http = require('http');
var options = {};

if (process.argv.length < 3 || argv.help) {
	console.error('\nusage: rex path [options]\n\n'+
		'if you create a rex.json file in your js dir rex will use its settings\n\n'+
		'--source  -s: a string to compile instead of a file\n'+
		'--base    -b: specify a base js file that rex can assume is loaded before any other file\n'+
		'--minify  -m: minify the compiled code\n'+
		'--out,    -o: compile to a specific path or file suffix if input path is a dir\n'+
		'--watch,  -w: watch the file and recompile if it or its dependencies changes. requires -o\n'+
		'--noeval, -n: do not use eval in the compiled code\n'+ 
		'--listen, -l: start a rex server on a given port serving cwd. port defaults to 8888\n'
	);
	process.exit(0);
	return;
}

try {
	options = JSON.parse(fs.readFileSync('rex.json', 'utf-8'));
} catch (err) {}

if (!('minify' in options)) options.minify = argv.minify;
if (!('base' in options)) options.base = typeof argv.base === 'string' && argv.base;
if (!('eval' in options)) options.eval = !argv.noeval;

argv.source = argv.source || options.source;
argv.out = argv.out || options.out;

var file = process.argv[2];
var parse = rex(options);

if (typeof argv.source === 'string') {
	file = new Function(argv.source);
}

if (argv.listen) {
	var port = typeof argv.listen === 'number' ? argv.listen : 8888;

	http.createServer(function(req, res) {
		res.writeHead(200, {'Content-Type':'text/javascript'});

		if (req.url === '/') {
			res.end('document.write("<script src=\'http://'+req.headers.host+'/"+encodeURIComponent(""+location)+"\'></script>");');
			return;
		}

		var url = decodeURIComponent(req.url.substr(1)).replace('~', process.env.HOME).replace(/^file:\/\/\/C:\//, '/');

		cat(url, function(err, str) {
			if (err) return res.end(err.stack);

			var src = (str.match(/<script[^>]+src=[^>]+>((?:\s|\S)+)<\/script>/i) || [])[1];

			parse(new Function(src), function(err, js) {
				if (err) return res.end(err.stack);
				res.end(js);
			});
		});
	}).listen(port);
	return;
}

var stat = typeof file === 'string' && fs.statSync(file);
var out = typeof argv.out === 'string' && argv.out;

if (!out && stat && stat.isDirectory()) out = 'lib';

argv.watch = out && (argv.watch || options.watch);

var watch = function(files, fn) {
	var onchange = function() {
		files.forEach(function(file) {
			file.removeListener('change', onchange);
		});
		fn();
	};

	files = files.map(function(file) {
		return (file = fs.watchFile(file, {interval:100}, onchange)).setMaxListeners(0) || file;
	});
};
var compile = function() {
	if (stat && stat.isDirectory()) {
		out = out || 'lib';

		fs.readdirSync(file).filter(function(file) {
			if (file.substr(-out.length-4) === '.'+out+'.js') return false;
			return /\.js$/.test(file);
		}).forEach(function(file) {
			parse(file, function(err, str, files) {
				if (argv.watch) watch(files, compile);
				if (err) return console.error(err.message);
				fs.writeFile(file.replace(/\.js$/, '.'+out+'.js'), str);
			});
		});
		return;
	}

	parse(file, function(err, str, files) {
		if (argv.watch) watch(files, compile);
		if (err) return console.error(err.stack);
		if (out) return fs.writeFile(out, str);
		console.log(str);
	});
};

compile();
