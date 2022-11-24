# @kylehue/Bundler

A library for bundling codes in-browser.

### Algorithm
```
1. If there are no .html files
   a. create a dummy empty .html file
   b. goto 2
2. If there are .html files
   a. let HTML_FILES = "the .html files"
   b. for each HTML in HTML_FILES
      GET_HTML_SCRIPTS(HTML)

GET_HTML_SCRIPTS(html_file)
1. let AST be the parsed .html file
2. scan AST and get script tags
3. if the script tags has src attribute
4. get src attribute value and store in entry points
5. return entry points


1. Load files like .vue, .scss, .ts, .jsx, etc. and exclude the .js and .css files
2. Get the type of their outputs and then find the loader dedicated for it (type can be .js or .css)
3. Transform all .js and .css files
4. Get the graph and bundle





e. bundle each entry point
f. create an object url for each bundle
g. change src attribute's value to the object url
h. return array of rendered AST
```