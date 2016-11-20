'use strict';
const _ = require('lodash');
module.exports = plugin;

function plugin(opts){
  opts = opts || {};
  return function(files, metalsmith, done) {
    const fileNames = Object.keys(files);
    for (let file of fileNames) {
      const fileObj = files[file];
      if (!fileObj.eval_layout) {
        continue;
      }
      const params = get_params(fileObj.layout)
      let pattern = fileObj.layout;

      params.forEach(function (element) {
          let replacement = _.get(fileObj, element);
          if (replacement) {
              pattern = pattern.replace(':' + element, replacement.toString());
          }
      });
      //console.log(`Eval layout for ${file} replace layout ${fileObj.layout} to ${pattern}`)
      files[file].layout = pattern
    }
    done();
  }
}

function get_params (pattern) {
    /* eslint no-cond-assign: 0 */
    var matcher = /:([\w]+(\.[\w]+)*)/g;
    var ret = [];
    var m;
    while (m = matcher.exec(pattern)) {
        ret.push(m[1]);
    }
    return ret;
};

