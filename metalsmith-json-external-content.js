'use strict';
const _ = require('lodash');
const slug = require('slug-component');
const path = require('path');
const fs = require('fs');
module.exports = plugin;

function plugin(opts){
  opts = opts || {};
  return function(files, metalsmith, done) {
    const fileNames = Object.keys(files);
    for (let file of fileNames) {
      const fileObj = files[file];

      if (!fileObj.data || !fileObj.data.htmlExternalContent) {
        continue;
      }

      const params = get_params(fileObj.data.htmlExternalContent)
      let pattern = fileObj.data.htmlExternalContent;

      params.forEach(function (element) {
        let replacement = _.get(fileObj.data, element);
        if (replacement) {
          pattern = pattern.replace(':' + element, slug(replacement.toString()));
        }
      });

      fileObj.data[opts.htmlContentField] = readContent(opts, pattern);
    }
    done();
  }
}

function readContent(opts, name) {
  const fn = path.join(path.normalize(opts.contentPath), name);
  let content;
  try {
    content = fs.readFileSync(fn, 'utf8')
  }
  catch(e) {
    var msg = `Warn: Unable to read file ${fn}. Error: ${e}`;
    console.warn(msg)
    return msg;
  }
  return content;
}

function get_params (pattern) {
    /* eslint no-cond-assign: 0 */
    var matcher = /:([\w]+)/g;
    var ret = [];
    var m;
    while (m = matcher.exec(pattern)) {
        ret.push(m[1]);
    }
    return ret;
};

