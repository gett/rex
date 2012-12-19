# Rex

Rex is "commonjs in the browser".

It's available through npm:

	npm install rex

There is also a cli program available

	npm install -g rex-cli
	rex --help

Usage is simple:

``` js
var rex = require('rex');
var parse = rex();

parse('test.js', function(err, compiled) {
	// this outputs test.js compiled for browser usage
	console.log(compiled);
});
```

Your browserside javascript can now use `require` to require other modules and `exports` and `module.exports` just like in node.js.
Additionally if your module exports a global variable with the same name as your module `require` will still work!  
If you require a module like `require('my-module')` rex will look for it in the nearest `browser_modules` or `node_modules` folder. If rex can't resolve a module name, no error is raised, instead require returns null on runtime.

``` js
// browserside code
var foo = require('./foo'); // will look for foo.js in the same folder
var bar = require('bar');   // will look for bar.js or bar/index.js in 
                            // the nearest browser_modules or node_modules folder

module.exports = function() { // will export a function
	return 'hello from module';
};
```

# Options

You can pass a set of options with `rex(options)`. They include:

* `base`: Specify a base js file. Rex will now assume that base's dependencies are loaded for all other requests.
* `dependencies`: A map of global dependencies to be loaded in the client. This could be jQuery from a cdn i.e. `{jQuery:'http://cdn.com/jQuery.js'}`.

# License

MIT