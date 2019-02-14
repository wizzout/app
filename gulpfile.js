const gulp = require('gulp');
const path = require('path');

const $ = require('gulp-load-plugins')();
const browserSync = require('browser-sync');
const reload = browserSync.reload;
const webpack = require('webpack-stream');
const config = require('./webpack.config');
const named = require('vinyl-named');
const del = require('del');
const inject = require('gulp-inject');
const colors = require('ansi-colors');
const logger = require('fancy-log');

const postcssPresetEnv = require('postcss-preset-env');
const hexrgba = require('postcss-hexrgba');
const objectFitImages = require('postcss-object-fit-images');
// const colorRgbaFallback = require('postcss-color-rgba-fallback');
// const cssnano = require('cssnano');
const csso = require('postcss-csso');

// var atImport = require("postcss-import")
const mqpacker = require('css-mqpacker');


const cachebust = require('gulp-cache-bust');
const htmlbeautify = require('gulp-html-beautify');
const sourcemaps = require('gulp-sourcemaps');

//for svg:sprite tasks
// const plumber     = require('gulp-plumber');
const rename = require('gulp-rename');
const cheerio = require('cheerio');
const through2 = require('through2');
const consolidate = require('gulp-consolidate');

const svgo = require('gulp-svgo');

const notify = require('gulp-notify');
const fs = require('fs');
const rl = require('readline');


const PATHS = {
  tmp: '.tmp',
  src: 'frontend',
  build: 'web'
};


// variable for production mode
var productionMode = false;
var isBuild = false;
var makePagesList = true;


// Errors handler

const errorHandler = function () {
  var args = Array.prototype.slice.call(arguments);
  notify.onError({
    title: 'Compile Error',
    message: '<%= error.message %>',
    sound: 'Submarine'
  }).apply(this, args);
  this.emit('end');
}


// VIEWS

// nunjucks:)
const view = () => {
  return gulp.src(PATHS.src + '/views/*.njk')
    .pipe($.nunjucksRender({
      path: [PATHS.src + '/', PATHS.src + '/views'],
      data: { markup: !productionMode }
    }))
    .on('error', errorHandler)
    .pipe(htmlbeautify({
      indent_size: 2,
      wrap_attributes: 'auto', // 'force'
      preserve_newlines: false,
      end_with_newline: true
    }))
    .pipe(gulp.dest(PATHS.tmp))
    .pipe($.if(browserSync.active, reload({ stream: true, once: true })));
}

const views = makePagesList ? gulp.series(view, function pagesList(){
  return gulp.src(PATHS.tmp + '/index.html')
    .pipe(inject(
      gulp.src([PATHS.tmp + '/*.html', '!' + PATHS.tmp + '/index.html'], { read: false }), {
        transform: function (filepath, file) {
          if (filepath.indexOf('assets') > -1 || filepath.indexOf('index.html') > -1) {
            return
          }
          filepath = filepath.replace('/' + PATHS.tmp + '/', '')
          if (filepath.slice(-5) === '.html') {
            return '<li><a href="' + filepath + '">' + filepath + '</a></li>';
          }
          // Use the default transform as fallback:
          return inject.transform.apply(inject.transform, arguments);
        }
      }
    ))
    .pipe(gulp.dest(PATHS.tmp))
}) : view;

exports.view = view;
exports.views = views;


// STYLES
var processors = [
  postcssPresetEnv({
    browsers: ['last 4 versions'],
    cascade: false,
    features: {
      customProperties: {
        preserve: true,
        warnings: false,
        noValueNotifications: 'error'
      }
    }
  }),
  hexrgba,
  objectFitImages,
  mqpacker({
    sort: sortMediaQueries
  })
]
if (isBuild) {
  processors.push(csso)
}

function isMax(mq) {
  return /max-width/.test(mq);
}

function isMin(mq) {
  return /min-width/.test(mq);
}

function sortMediaQueries(a, b) {
  A = a.replace(/\D/g, '');
  B = b.replace(/\D/g, '');

  if (isMax(a) && isMax(b)) {
    return B - A;
  } else if (isMin(a) && isMin(b)) {
    return A - B;
  } else if (isMax(a) && isMin(b)) {
    return 1;
  } else if (isMin(a) && isMax(b)) {
    return -1;
  }

  return 1;
}

const styles = () => {
  return gulp.src(PATHS.src + '/styles/*.scss')
    .pipe($.plumber()).on('error', function (err) { console.error(err); })
    .pipe($.if(!isBuild, sourcemaps.init()))
    .pipe($.sass.sync({
      outputStyle: 'expanded',
      precision: 10,
      includePaths: ['.', 'node_modules']
    }).on('error', $.sass.logError))
    .on('error', errorHandler)
    .pipe($.postcss(processors))
    .pipe($.if(!isBuild, sourcemaps.write()))
    .pipe(gulp.dest(PATHS.tmp + '/styles'))
    .pipe(browserSync.stream());
};

exports.styles = styles;


// SCRIPTS
// with webpack for frontend files
const scripts = () => {
  let bundleEntries = [
    './' + PATHS.src + '/scripts/app.js',
  ];
  return gulp.src(bundleEntries)
    .pipe($.plumber()).on('error', function (err) { console.error(err); })
    .pipe(named())
    .pipe(webpack(config.createConfig(bundleEntries[0], isBuild, productionMode)))
    .pipe(gulp.dest(isBuild ? PATHS.build + '/scripts' : PATHS.tmp + '/scripts'))
    .pipe($.if(browserSync.active, reload({ stream: true, once: true })));
};


exports.scripts = scripts;

// FONTS

const fonts = () => {
  return gulp.src(PATHS.src + '/fonts/**/*')
    .pipe(gulp.dest(PATHS.build + '/fonts'))
    .pipe(
      $.if(browserSync.active,
        reload({
          stream: true,
          once: true
        })
      )
    );
}

exports.fonts = fonts;

// copy fonts from Bootstrap and font-awesome as they don't include their fonts in their bower.json file
const copyBsFonts = () => {
  return gulp.src('node_modules/bootstrap-sass/assets/fonts/bootstrap/*.{eot,svg,ttf,woff,woff2}', { allowEmpty: true })
    .pipe(gulp.dest(PATHS.src + '/fonts/'));
}

const copyFaFonts = () => {
  return gulp.src('node_modules/font-awesome/fonts/*.{eot,svg,ttf,woff,woff2}', { allowEmpty: true })
    .pipe(gulp.dest(PATHS.src + '/fonts/'));
}

// this task should be called manually if we need bs or fa fonts
// it copies these fonts to fonts/ folder
gulp.task('put-fonts', gulp.parallel(copyBsFonts, copyFaFonts))



// USEREF
// concat and move styles and scripts files
// found in .tmp/*.html <!-- build -->...<!-- endbuild --> blocks to web/ folder,
// move html files found in .tmp/ to web/ folder

const userefAssets = gulp.series(views, gulp.parallel(scripts, fonts, styles), function assets() {
  // look at useref blocks only in one file - index.html
  // build only assets found there
  // to speed up build process
  return gulp.src(PATHS.tmp + '/index.html')
    .pipe($.useref({ searchPath: [PATHS.tmp, PATHS.src, '.'] }), { allowEmpty: true })

    .pipe($.if('*.js', $.uglify({ compress: { drop_console: true } })))

    .pipe($.if('*.css', $.postcss([
      csso
    ])))

    .pipe($.if('!*.html', gulp.dest(PATHS.build)))
});

const useref = gulp.series(userefAssets, function userefHandler() {
  // build only htmls
  return gulp.src(PATHS.tmp + '/*.html')
    .pipe(htmlbeautify({
      indent_size: 2,
      wrap_attributes: 'auto', // 'force'
      preserve_newlines: false,
      // unformatted: [],
      end_with_newline: true
    }))
    .pipe($.useref({ noAssets: true }))
    .pipe($.if(!productionMode, cachebust({ basePath: PATHS.build + '/' })))
    .pipe(productionMode ? $.if('!*.html', gulp.dest(PATHS.build)) : gulp.dest(PATHS.build))
});

exports.useref = useref;
exports.userefAssets = userefAssets;


// IMAGES
const images = () => {
  return gulp.src(PATHS.src + '/images/**/*')
    .pipe($.if(!'sprite.svg', $.cache($.imagemin({
      progressive: true,
      interlaced: true,
      // don't remove IDs from SVGs, they are often used
      // as hooks for embedding and styling
      svgoPlugins: [{ cleanupIDs: false }, { removeViewBox: false }]
    })
    )))
    .pipe(gulp.dest(PATHS.build + '/images'))
    .pipe($.if(browserSync.active, reload({ stream: true, once: true })));
}

// PICS
const pics = () => {
  return gulp.src(PATHS.src + '/pics/**/*')
    .pipe(gulp.dest(PATHS.build + '/pics'))
    .pipe($.if(browserSync.active, reload({ stream: true, once: true })));
}

exports.images = images;
exports.pics = pics;


// COPY I/ FOLDER (TODO: maybe remove it or unite with other task)
const icons = () => {
  return gulp.src(PATHS.src + '/i/**/*')
    .pipe(gulp.dest(PATHS.build + '/i'));
}

exports.icons = icons;


const svgoIcons = () => {
  return gulp
    .src(PATHS.src + '/icons/*.svg')
    .pipe(svgo({
      js2svg: {
        indent: 2, // optional, default is 4
        pretty: true
      },
      plugins: [
        { removeViewBox: false }
      ]
    }))
    .pipe(gulp.dest(PATHS.src + '/icons/'));
}

const spriteSvg = () => {
  return gulp
    .src(PATHS.src + '/icons/*.svg')
    .pipe(svgo({
      js2svg: {
        indent: 2, // optional, default is 4
        pretty: true
      },
      plugins: [
        { removeViewBox: false }
      ]
    }))
    .pipe($.rename({ prefix: 'svg-icon-' }))
    .pipe($.svgstore({ inlineSvg: false }))
    .pipe(through2.obj(function (file, encoding, cb) {
      var $ = cheerio.load(file.contents.toString(), { xmlMode: true });
      var data = $('svg > symbol').map(function () {
        var $this = $(this);
        var viewBox = $this.attr('viewBox') || '0 0 ' + $this.attr('width') + ' ' + $this.attr('height');
        var size = viewBox.split(' ').splice(2);
        var name = $this.attr('id');
        var ratio = size[0] / size[1]; // symbol width / symbol height
        var stroke = $this.find('[stroke]').attr('stroke');
        $('style').remove()
        return {
          name: name,
          ratio: +ratio.toFixed(2),
          fill: 'currentColor', //fill || 'initial',
          stroke: stroke || 'initial'
        };
      }).get();
      this.push(file);

      gulp.src(PATHS.src + '/styles/generated/templates/_svg-sprite.scss')
        .pipe(consolidate('lodash', {
          symbols: data
        }))
        .pipe(gulp.dest(PATHS.src + '/styles/generated/'));
      cb();
    }))
    .pipe($.cheerio({
      run: function ($, file) {
        $('[fill]:not([fill="currentColor"])').removeAttr('fill');
        $('[stroke]').removeAttr('stroke');
      },
      parserOptions: { xmlMode: true }
    }))
    .pipe(rename({ basename: 'sprite' }))
    .pipe(gulp.dest(PATHS.src + '/images/'));
}

exports.spriteSvg = spriteSvg;
gulp.task('sprite:svg', spriteSvg);

exports.svgoIcons = svgoIcons;




// clear cache for images tasks
const cacheClean = done => {
  return $.cache.clearAll(done);
};

exports.cacheClean = cacheClean;


// OPTIMIZE IMAGES IN MEDIA FOLDER (if nedded)
const optimizeMedia = () => {
  return gulp.src(PATHS.build + '/media/**/*.{gif,jpeg,jpg,png}')
    .pipe($.size({ title: 'before build', gzip: true }))
    .pipe($.cache($.imagemin({
      progressive: true,
      interlaced: true,
      // don't remove IDs from SVGs, they are often used
      // as hooks for embedding and styling
      svgoPlugins: [{ cleanupIDs: false }]
    })).on('error', function (err) { console.log(err); this.end(); }))
    .pipe($.size({ title: 'after build', gzip: true }))
    .pipe(gulp.dest(PATHS.build + '/media/'));
};

gulp.task('optimize-media', optimizeMedia)
exports.optimizeMedia = optimizeMedia;



// EXTRAS
const extras = (done) => {
  return gulp.src([
    PATHS.src + '/*.*'
  ], {
      dot: true
    }).pipe(gulp.dest(PATHS.build));
};

exports.extras = extras;

//LINTERS

// ESLINT
const eslint = () => {
  return gulp.src([PATHS.src + '/scripts/**/*.js', '!' + PATHS.src + '/scripts/admin/*.js'])
    .pipe($.eslint({
      fix: false
    }))
    .pipe($.eslint.format('codeframe'))
    .pipe($.if(!browserSync.active, $.eslint.failAfterError()));
}

gulp.task('eslint', eslint);

// STYLELINT
const stylelint = done => {
  return gulp.src([
    PATHS.src + '/styles/**/*.scss',
    '!' + PATHS.src + '/styles/generated/templates/*.*',
    '!' + PATHS.src + '/styles/admin/*.css',
    '!' + PATHS.src + '/styles/main.scss',
    '!' + PATHS.src + '/styles/_fonts.scss'
  ])
    .pipe($.stylelint({
      failAfterError: !browserSync.active ? true : false,
      reporters: [{
        formatter: 'string',
        console: true
      }],
      debug: true
    }));
};

gulp.task('stylelint', stylelint);


// SERVE

const server = done => {

  browserSync({
    notify: false,
    port: 9000,
    browser: 'Google Chrome',
    // tunnel: true,
    server: {
      baseDir: [PATHS.tmp, PATHS.src],
      routes: {
        '/node_modules': 'node_modules'
      }
    },
    logPrefix: 'RocketfirmDev',
    // logLevel: 'debug',
    logConnections: true,
    ghostMode: false
  });

  addWatcher(PATHS.src + '/views/**/*.njk', views);
  addWatcher(PATHS.src + '/icons/*.svg', spriteSvg);
  addWatcher(PATHS.src + '/styles/**/*.scss', gulp.series(styles, stylelint));
  addWatcher(PATHS.src + '/scripts/**/*.js', gulp.series(scripts, eslint));
  addWatcher(PATHS.src + '/images/**/*', images);
  addWatcher(PATHS.src + '/pics/**/*', pics);
  addWatcher(PATHS.src + '/fonts/**/*', fonts);

  done()
}
const serve = gulp.series(gulp.parallel(svgoIcons, spriteSvg, views, styles, scripts), server);


function addWatcher(watchPath, tasks) {
  return gulp.watch(watchPath, tasks).on('unlink', function (filepath) {
    logger(
      'unlink:',
      colors.white.bgRed(' ' + filepath + ' ')
    );
    var filePathFromSrc = path.relative(path.resolve(PATHS.src), filepath);
    var destFilePath = path.resolve(PATHS.tmp, filePathFromSrc);
    del.sync(destFilePath);
  })
}

exports.serve = serve;




gulp.task('serve:web', done => {
  browserSync({
    notify: false,
    port: 9000,
    server: {
      baseDir: [PATHS.build]
    }
  });

  done()
});


// SIZE
// get sizes of build assets
// ***
// get total size of web/ except media/ folder
function getSize(done) {
  return gulp.src([
    PATHS.build + '/**/*',
    '!' + PATHS.build + '/media/**/*'
  ])
    .pipe($.size({
      title: 'web/',
      gzip: true
    }))
}

gulp.task('size', getSize)


function sizeAll() {
  return gulp.src([
    PATHS.build + '/**/*'
  ])
    .pipe($.size({
      title: 'web/',
      gzip: true
    }));
}

// get total size of web/
gulp.task('size:all', sizeAll);

function sizeStyles() {
  return gulp.src([
    PATHS.build + '/styles/**/*'
  ])
    .pipe($.size({
      title: 'styles',
      showFiles: true,
      gzip: true
    }));
}
// get total size of styles/ in web/
gulp.task('size:styles', sizeStyles);

// get total size of scripts/ in web/
gulp.task('size:scripts', () => {
  return gulp.src([
    PATHS.build + '/scripts/**/*'
  ])
    .pipe($.size({
      title: 'scripts',
      showFiles: true,
      gzip: true
    }));
});

// get total size of images/ in web/
gulp.task('size:images', () => {
  return gulp.src([
    PATHS.build + '/images/**/*'
  ])
    .pipe($.size({
      title: 'images',
      gzip: true
    }));
});

// get total size of fonts/ in web/
gulp.task('size:fonts', () => {
  return gulp.src([
    PATHS.build + '/fonts/**/*'
  ])
    .pipe($.size({
      title: 'fonts',
      gzip: true
    }));
});

// get size of media/ in web/
gulp.task('size:media', () => {
  return gulp.src([
    PATHS.build + '/media/**/*'
  ])
    .pipe($.size({
      title: 'media',
      gzip: true
    }));
});

gulp.task('size:detailed', () => {
  gulp.start('size:styles', 'size:scripts', 'size:images', 'size:fonts');
});


// CLEAN

const clean = () => del([
  '.tmp',
  'web/**',
  '!web',
  '!web/css/**',
  '!web/js/**',
  '!web/*.php',
  '!web/assets/**',
  '!web/media/**',
  '!web/i/**'
])

exports.clean = clean;


// set production mode needed for useref task
const productionModeTrue = done => {
  productionMode = true;
  logger(
    'Production Mode:',
    colors.white.bgRed(' ' + productionMode + ' ')
  );
  done();
};

const productionModeFalse = done => {
  productionMode = false;
  logger(
    'Production Mode:',
    colors.white.bgRed(' ' + productionMode + ' ')
  );
  done();
};




// // BUILD
// // build for markup

const setBuildMode = done => {
  isBuild = true;
  done();
}

const buildMarkup = gulp.series(
  setBuildMode,
  clean,
  productionModeFalse,
  gulp.parallel(
    useref,
    images,
    icons,
    pics,
    extras,
  ),
  getSize
)

// build for production
const buildProd = gulp.series(
  setBuildMode,
  clean,
  productionModeTrue,
  gulp.parallel(
    useref,
    images,
    icons,
    extras
  ),
  getSize
)

gulp.task('build:prod', buildProd);
gulp.task('build', buildMarkup);






gulp.task('default', done => {
  logger('Production Mode:', colors.white.bgRed(' ' + productionMode + ' '));
  serve(done)
});




gulp.task('add-sync', (done) => {

  var filename = 'package.json';
  var obj = {};
  var prompts = rl.createInterface(process.stdin, process.stdout);
  var src = 'web/';
  var dest = 'rocketman@rocketfirm.net:/var/www/vhosts/rocketfirm.net/';
  var markupUrl = 'markup.rocketfirm.net/';
  var command = 'rsync -auFFv --del --delete-excluded ';
  var commandName = 'sync';

  var recursiveAsyncReadLine = function () {
    prompts.question('Введи название папки на маркапе: /', function (answer) {
      var foldername = answer.trim();
      if (foldername == 'exit') {
        console.log('Ну пока (:');
        prompts.close();
        done();
        // return process.exit(1);  //closing RL and returning from function.
      } else if (!foldername.length) {
        prompts.close();
        recursiveAsyncReadLine();
      } else {
        prompts.close();
        writeToFile(command + ' ' + src + ' ' + dest, markupUrl + foldername)
      }
    });
  };

  var writeToFile = function (cmd, folder) {
    if (obj) {
      if (!obj.scripts) obj.scripts = {};
      obj.scripts[commandName] = cmd + folder;
      json = JSON.stringify(obj, null, 4);
      fs.writeFile(filename, json, 'utf8', (err, data) => {
        if (err) {
          console.log('Что-то пошло не так, зови Энди (https://t.me/nd_pzzz)');
          done();
        } else {
          console.log('Теперь можешь заливать изменения на маркап \nпо комманде npm run ' + commandName + ' или yarn ' + commandName)

          console.log('Ссылка на проект \nhttp://' + folder)


          done();
        }
      });
    }
  }

  fs.readFile(filename, 'utf8', function readFileCallback(err, data) {
    if (err) {
      console.error(err);
      process.exit(1);
    } else {
      obj = JSON.parse(data); //now it an object

      if (obj.scripts && obj.scripts[commandName]) {
        var cmd = obj.scripts[commandName];
        if (typeof cmd === 'string' && cmd.length && cmd.indexOf('add-sync') === -1) {
          var re = /(?:\/[^\/\r\n]*)$/g;
          var current = re.exec(cmd)
          console.log('Ссылка на проект \nhttp://' + current)
          prompts.question('Синхронизация уже настроена. \nПапка ' + current + ' \nПеренастроить? (y/n) ', function (answer) {
            if (answer !== 'y') {
              console.log('Ну пока (:');
              prompts.close();
              return process.exit(1);  //closing RL and returning from function.
            } else {
              // prompts.close();
              recursiveAsyncReadLine();
            }
          });
        } else {
          recursiveAsyncReadLine();
        }
      } else {
        recursiveAsyncReadLine();
      }
    }
  });



});
