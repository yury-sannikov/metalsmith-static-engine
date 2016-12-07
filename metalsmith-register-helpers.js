const extend = require('extend')
const bluebird = require('bluebird');
const fs = bluebird.promisifyAll(require('fs'));
const Handlebars = require('handlebars')

module.exports = plugin

function plugin (options) {
  options = extend({
    directory: 'helpers'
  }, options || {})

  return function (files, metalsmith, done) {
    // Manage directories. Whether it array or not...
    options.directory = Array.isArray(options.directory) ? options.directory : [options.directory];
    // Read all dirs
    Promise.all(
        options.directory.map((dirPath)=>fs.readdirAsync(metalsmith.path(dirPath)))
    ).then((dirs)=>{
      dirs.forEach((files,index)=>{
        _handleDir(files,metalsmith,options.directory[index]);
      });
      done();
    }).catch((err)=>done(err));
  }
}
// Nothing asynchronous here. Invoke done just after that.
function _handleDir(files,metalsmith,dirPath){
  files.forEach(function (file) {
    var helperContents
    var path
    var templateName

    path = metalsmith.path(dirPath, file)
    helperContents = require(path)

    switch (typeof helperContents) {
      case 'function':
        templateName = file.split('.').shift()
        Handlebars.registerHelper(templateName, helperContents)
        break
      case 'object':
        Handlebars.registerHelper(helperContents)
        break
    }
  })
}
