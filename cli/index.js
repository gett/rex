#!/usr/bin/env node

// TODO: clean up this messy code

var argv = require('optimist')
			.alias('o', 'out')
			.alias('m', 'main')
			.alias('c', 'minify')
			.alias('h', 'help')
			.alias('w', 'watch')
			.alias('l', 'listen')
			.argv;

var cat = require('cat');
var rex = require('rex');
var fs = require('fs');
var http = require('http');
var options = {};

if (process.argv.length < 3 || argv.help) {
	console.error('\nusage: rex path [options]\n\n'+
		'if you create a rex.json file in your js dir rex will use its settings\n\n'+
		'--main    -m: specify a main js file that rex can assume is loaded before any other file\n'+
		'--minify  -c: minify the compiled code\n'+
		'--out,    -o: compile to a specific path or file suffix if input path is a dir\n'+
		'--watch,  -w: watch the file and recompile if it or its dependencies changes. requires -o\n'+
		'--listen, -l: start a rex server on a given port serving cwd. port defaults to 8888\n'
	);
	process.exit(0);
	return;
}

try {
	options = JSON.parse(fs.readFileSync('rex.json', 'utf-8'));
} catch (err) {}

if (!('minify' in options)) options.minify = argv.minify;
if (!('main' in options)) options.main = typeof argv.main === 'string' && argv.main;

argv.out = argv.out || options.out;
argv.watch = argv.watch || options.watch;

options.onchange = function() {
	compile();
};

var file = process.argv[2];
var parse = rex('.', options);

if (argv.listen) {
	var port = typeof argv.listen === 'number' ? argv.listen : 8888;

	http.createServer(function(req, res) {
		res.writeHead(200, {'Content-Type':'text/javascript'});

		if (req.url === '/') {
			res.end('document.write("<script src=\'http://'+req.headers.host+'/"+encodeURIComponent(""+location)+"\'></script>");');
			return;
		}

		var url = decodeURIComponent(req.url.substr(1));

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

var stat = fs.statSync(file);
var out = typeof argv.out === 'string' && argv.out;

if (!out && stat.isDirectory()) out = 'lib';
if (argv.watch && out) setInterval(function() {}, 10000); // hackish keep-alive

var compile = function() {
	if (stat.isDirectory()) {
		out = out || 'lib';

		fs.readdirSync(file).filter(function(file) {
			if (file.substr(-out.length-4) === '.'+out+'.js') return false;
			return /\.js$/.test(file);
		}).forEach(function(file) {
			parse(file, function(err, str) {
				if (err) return console.error(err.message);
				fs.writeFile(file.replace(/\.js$/, '.'+out+'.js'), str);
			});
		});
		return;
	}
	parse(file, function(err, str) {
		if (err) return console.error(err.stack);
		if (out) return fs.writeFile(out, str);
		console.log(str);
	});
};

compile();