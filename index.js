'use strict';
const Metalsmith = require('metalsmith');
const changed = require('metalsmith-changed');
const livereload = require('metalsmith-livereload');
const nodeStatic = require('node-static');
const watch = require('glob-watcher');
const open = require('open');
const include = require('metalsmith-include');
const layouts = require('metalsmith-layouts');
const measure = require('hrtime-measure');
const renamer = require('metalsmith-renamer');
const msIf = require('metalsmith-if');
const asset = require('metalsmith-static');
const markdown = require('metalsmith-markdown');
const jsonToFiles = require('metalsmith-json-to-files');
const collections = require('metalsmith-collections');
const permalinks = require('metalsmith-permalinks');
const metadata = require('metalsmith-metadata');
const dep = require('./metalsmith-include-dependency');
const inplace = require('metalsmith-in-place');
const evalLayout = require('./metalsmith-eval-layout');
const metainfo = require('./metalsmith-metainfo');
const templateAssets = require('./metalsmith-template-assets');
const htmlMinifier = require('metalsmith-html-minifier');
const jsonContent = require('./metalsmith-json-external-content');


const path = require('path');
const rimraf = require('rimraf')
const _ = require('lodash');

function helpersFactory() {
  return {
    _: require('lodash')
  }
}

// plugin wrapper, replacing metalsmith.path()
// with opts.partialsPath to be able to specify correct partials path
function pluginWrapper(plugin, opts) {
  const pluginInstance = plugin(opts)
  return function(files, metalsmith, done) {
    const ms = Object.assign(
      Object.create(Object.getPrototypeOf(metalsmith)),
      metalsmith,
      {
        path: () => opts.overrideMetalsmithPath ? opts.overrideMetalsmithPath : metalsmith.path(),
        directory: () => opts.overrideMetalsmithDirectory ? opts.overrideMetalsmithDirectory: metalsmith.directory()
      }
    )
    return pluginInstance(files, ms, done)
  }
}

function timeLogger(name){
  return function(files, metalsmith, done) {
    var start = new Date().getTime();
    var started = new Date().toISOString().slice(14, -1);
    done();
    var end = new Date().getTime();
    console.log(`    => ${name} : ${started} - ${end - start}ms`);
  }
}


function metalsmithFactory(workDir, buildDir, options) {

  const sourceDir = path.join(workDir, options.source)
  const themeDir = path.normalize(options.themeDir)
  return Metalsmith(workDir)
    // Folder with source data
    .source(sourceDir)
    // Folder with results
    .destination(buildDir)
    // Clean result folder if 'clean' is true.
    // Do full clean if layout or partial has been changed
    .clean(options._clean)
    // Inject metadata from JSON files into context.
    .use(timeLogger('injet metadata'))
    .use(metadata({
      practice: 'data/practice.json',
      menu: 'data/menu.json',
      contents: 'data/contents.json',
      reviews: 'data/reviews.json'
    }))
    .use(timeLogger('copy template assets'))
    .use(
      // If clean build, copy over assets from public folder
      msIf(options._generate,
        templateAssets([
        {
          src: path.join(options.themeDir, 'assets'),
          dest: 'assets'
        }])
      )
    )
    .use(timeLogger('copy site assets'))
    .use(
      // If clean build, copy over assets from public folder
      msIf(options._generate,
        templateAssets([
        {
          src: path.join(workDir, 'assets'),
          dest: 'assets'
        }])
      )
    )
    .use(timeLogger('copy widgets'))
    .use(
      msIf(options._generate,
        templateAssets([
        {
          src: path.join(options.themeDir, '../widgets'),
          dest: 'assets/widgets'
        }])
      )
    )
    .use(timeLogger('check dependencies'))
    // Dependency tracking for metalsmith-include. Set ctime for all dependent files to the latest value of the group
    .use(dep())
    // Track file changes in 'src' folder. Pass down only changed file to reduce build time
    // Temporarely disabled as has a conflict with metalsmith-include plugin
    // Can be improved by checking metalsmith-include dependencies and update ctime
    .use(msIf(!options._force, changed()))
    .use(timeLogger('process markdown markup'))
    // Markdown Syntax
    .use(msIf(options._generate,
      markdown({
        smartypants: true,
        gfm: true,
        tables: true
      }))
    )
    // Allow to include markdown files into JADE
    .use(timeLogger('process markdown includes'))
    .use(include({
      deletePartials: true
    }))
    .use(timeLogger('load JSON data as HTML files'))
    .use(jsonToFiles({
      source_path: path.join(workDir, options.dataFolder, '/')
    }))
    .use(timeLogger('load JSON external content'))
    .use(jsonContent({
      contentPath: path.join(workDir, options.dataFolder, '/'),
      htmlContentField: 'htmlContent'
    }))
    .use(timeLogger('use collections'))
    .use(collections({
      providers: {},
      services: {},
      contents: {}
    }))
    .use(timeLogger('generate permalinks'))
    .use(permalinks({
      relative: false,
      date: 'YYYY',
      linksets: [{
          match: { collection: 'blogposts' },
          pattern: 'blog/:date/:title',
          date: 'mmddyy'
      }]
    }))
    // If eval_layout is true, treat layout as a field containing computable value
    .use(timeLogger('evaluate variable layouts'))
    .use(evalLayout())
    .use(timeLogger('generate metainformation'))
    .use(msIf(options._force,
      metainfo({
        metainfoPath: path.join(workDir, options.metainfo),
        includeForMetaOnly: ['menu', 'practice'],
        outputFile: path.join(buildDir, 'metainfo.json')
      })))
    // PUG/Jade layouts system
    .use(timeLogger('generate HTML using PUG layouts'))
    .use(msIf(options._generate,
      layouts({
        engine: 'pug',
        layoutPattern: '*.pug',
        pretty: !options._minify,
        directory: path.join(themeDir, 'layouts'),
        helpers: helpersFactory(),
        deployOptions: options._deploy
      }))
    )
    .use(timeLogger('generate HTML using Handlebars template'))
    .use(msIf(options._generate,
      pluginWrapper(inplace, {
        engine: 'handlebars',
        partials: options.partials,
        overrideMetalsmithPath: options.partialsPath
      }))
    )
    .use(timeLogger('minify files'))
    .use(msIf(options._minify === true, htmlMinifier()))
}

class SiteBuilderEngine {
  constructor(workDir, buildDir, options) {
    this.workDir = workDir
    this.buildDir = buildDir
    this.options = Object.assign({}, {
      metainfo: 'metainfo',
      partials: 'inplacePartials',
      source: 'src',
      dataFolder: 'src/data',
      theme: 'cleanui'
    }, options)
  }


  cleanRequireCache() {
    _(Object.keys(require.cache))
      .filter((fn) => fn.indexOf('.json') !== -1)
      .forEach((fn) => {
        delete require.cache[fn]
      })
  }

  prepare(done) {
    this.cleanRequireCache()
    const ms = metalsmithFactory(this.workDir, this.buildDir, Object.assign({}, this.options, {
      _clean: true,
      _force: true,
      _generate: true
    }))
    ms.build(done)
  }

  metainfo(done) {
    this.cleanRequireCache()
    const ms = metalsmithFactory(this.workDir, this.buildDir, Object.assign({}, this.options, {
      _clean: false,
      _force: true,
      _generate: false
    }))
    ms.build(done)
  }

  generate(force, done) {
    console.log(`Generate. Force = ${force}`)
    this.cleanRequireCache()
    const ms = metalsmithFactory(this.workDir, this.buildDir, Object.assign({}, this.options, {
      _clean: true,
      _generate: true,
      _force: force
    }))
    ms.build(done)
  }

  publish(deployOptions, done) {
    this.cleanRequireCache()
    const ms = metalsmithFactory(this.workDir, this.buildDir, Object.assign({}, this.options, {
      _clean: true,
      _generate: true,
      _force: true,
      _deploy: deployOptions,
      _minify: true
    }))
    ms.build((err, files) => {
      if (err) {
        console.log(err);
        done(err, files)
        return
      }
      rimraf(`${this.buildDir}{/metainfo.json,/data}`, (e) => {
        done(err, files)
      })
    })
  }

  cliDev(port, buildResult) {

    const me = this
    const ms = metalsmithFactory(this.workDir, this.buildDir, Object.assign({}, this.options, {
      _clean: true,
      _generate: true,
      _force: true
    }))

    ms
      .use(livereload({ debug: true }))
      .build((err, files) => {
        if (err) {
          buildResult(err, files)
          return
        }
        buildResult(err, files)

        var serve = new nodeStatic.Server(this.buildDir);
        require('http').createServer((req, res) => {
          req.addListener('end', () => serve.serve(req, res));
          req.resume();
        }).listen(port);

        console.log(`Serving HTTP on port ${port}`)

        const build = function build() {
          return (done) => {
            console.log(`Rebuild.`)
            ms.build((err, files) => {
              console.log('Rebuild done.')
              buildResult(err, files)
              done()
            })
          }
        }
        const themeDir = path.normalize(this.options.themeDir)
        // Quick build if src changed
        watch(path.join(this.workDir, '**/*'), { ignoreInitial: true }, build());
        watch(path.join(themeDir, 'layouts/**/*'), { ignoreInitial: true }, build());
        watch(path.join(themeDir, 'partials/**/*'), { ignoreInitial: true }, build());
        watch(path.join(themeDir, 'assets/**/*'), { ignoreInitial: true }, build());
        watch(path.join(themeDir, 'inplacePartials/**/*'), { ignoreInitial: true }, build());
      })
  }


}


module.exports = SiteBuilderEngine
