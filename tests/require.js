var assert = require('assert');
var trees = require('../trees');

var eq = function(src, reqs) {
	assert.deepEqual(trees.requires(src), reqs);
};

eq('', []);
eq('require("foo")', ['foo']);
eq("require('foo')", ['foo']);
eq('require("foo-bar")', ['foo-bar']);
eq('require("foo bar")', ['foo bar']);
eq('require("foo bar / baz")', ['foo bar / baz']);
eq('require("./meh")', ['./meh']);
eq('var a = require("a");', ['a']);
eq('var a = require("a"); var b = require("b");', ['a','b']);
eq('var a = require("a");\n\n\nvar b = require("b");', ['a','b']);
eq('// var a = require("a");', []);
eq('var b = require("b"); // var a = require("a");', ['b']);
eq('var a = require("a"); /*\n\n\n var a = require("b"); */', ['a']);
eq('var a = require("a"); /*\n\n\n var a = require("b"); */', ['a']);
eq('var a = require("a"); "var a = require(\\"b\\"); "', ['a']);
eq('var a = require("a","b");', ['a','b']); // non-standard requires (for loading extensions)
eq('var a = require("a");\nrequire("b") // @rex-ignore', ['a']);
eq('var a = require("a"); var a = require("a");', ['a']);