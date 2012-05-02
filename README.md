# Rex

Rex is "commonjs in the browser" connect middleware.

It's available through npm:

	npm install rex

There is also a cli program available

	npm install -g rex-cli
	rex --help

Usage is simple:

``` js
var rex = require('rex');
var app = connect(); // this could also be an express instance

app.use('/js', rex('js')); // rex will now serve all your javascript from the js folder
```

Your browserside javascript can now use `require` to require other modules and `exports` and `module.exports` just like in node.js.
Additionally if your module exports a global variable with the same name as your module `require` will still work!  
If you require a module like `require('my-module')` rex will look for it in the nearest `browser_modules` or `node_modules` folder.

``` js
// browserside code
var foo = require('./foo'); // will look for foo.js in the same folder
var bar = require('bar');   // will look for bar.js or bar/index.js in 
                            // the nearest browser_modules or node_modules folder

module.exports = function() { // will export a function
	return 'hello from module';
};
```

If you just want to compile a file without serving it through middleware you can do it like so:

``` js
var rex = require('rex');
var parse = rex();

parse('my-file.js', function(err, compiled) {
	console.log(compiled);
});
```

# Options

You can pass a set of options with `rex(folder_or_path, options)`. They include:

* `main`: Specify a main js file. Rex will now assume that main's dependencies are loaded for all other requests.
* `dependencies`: A map of global dependencies to be loaded in the client. This could be jQuery from a cdn i.e. `{jQuery:'http://cdn.com/jQuery.js'}`.
* `minify`: If true Rex will use uglify-js to minify the parsed javascript.
* `cache`: Defaults to true. Specifies whether or not Rex should cache the parsed javascript in ram.

# Performance

Performance is one of the main goals of this project. Rex caches all the files requested in ram until they are changed.
This means that the files are only parsed once and all subsequent requests will just be returning a stored buffer.
The cache includes a gzipped version of the content which rex will serve if the client supports gzipping.

# License

MIT