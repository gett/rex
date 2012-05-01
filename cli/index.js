#!/usr/bin/env node

var argv = require('optimist')
			.alias('o', 'out')
			.alias('m', 'minify')
			.alias('h', 'help')
			.alias('w', 'watch')
			.argv;

var rex = require('rex');
var fs = require('fs');
var options = {};

if (process.argv.length < 3 || argv.help) {
	console.error('\nusage: rex path [options]\n\n'+
		'if you create a rex.json file in your js dir rex will use its settings\n\n'+
		'--main   -m: specify a main js file that rex can assume is loaded before any other file\n'+
		'--minify   : minify the compiled code\n'+
		'--out,   -o: compile to a specific path or file suffix if input path is a dir\n'+
		'--watch, -w: watch the file and recompile if it or its dependencies changes. requires -o\n'
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