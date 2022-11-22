# @kylehue/Bundler

A library for bundling codes in-browser.

### Algorithm
```
a. let AST be the parsed .html file
b. scan AST and get script tags
c. if the script tags has src attribute
d. get src attribute value and store in entry points
e. bundle each entry point
f. create an object url for each bundle
g. change src attribute's value to the object url
h. return array of rendered AST
```