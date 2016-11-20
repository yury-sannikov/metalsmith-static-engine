'use strict';
module.exports = plugin;

function plugin(opts){
  opts = opts || {};
  return function(files, metalsmith, done) {
    const fileNames = Object.keys(files);
    for (let file of fileNames) {
      const fileObj = files[file];
      if (!fileObj.include) {
        continue;
      }
      const dependentFileNames = Object
        .keys(fileObj.include)
        .map((k) => fileObj.include[k])
        .map((f) => fileNames.find( (fn) => fn.indexOf(f) !== -1 ))
      updateCtimeToLatest(files, [...dependentFileNames, file])
    }
    done();
  }
}

function updateCtimeToLatest(files, dependentNames) {
  const ctimes = dependentNames.map((n) => files[n].stats.ctime.getTime());
  const maxCtime = Math.max(...ctimes)
  dependentNames.forEach((n)=> {
    if (files[n].stats.ctime.getTime() === maxCtime) {
      return;
    }
    files[n].stats.ctime = new Date(maxCtime);
    console.warn(`Force update change time for ${n} as dependent`);
  })

}
