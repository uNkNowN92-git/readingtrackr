var gulp = require('gulp'); 

var jshint     = require('gulp-jshint');
var concat     = require('gulp-concat');
var uglify     = require('gulp-uglify');
var rename     = require('gulp-rename');
var minifyCss  = require('gulp-minify-css');
var ngAnnotate = require('gulp-ng-annotate');

var styles = [
  "src/style/jquery.datetimepicker.css",
  "src/style/angular-flash.min.css",
  "src/style/normalize.css",
  "src/style/fonts.css",
  "src/style/base.css",
];

var appScripts = 'src/js/app.js';

var vendorScripts = [
  "src/js/jquery-2.1.4.min.js",
  "src/js/pouchdb-5.1.0.min.js",
  "src/js/pouchdb.authentication.min.js",
  "src/js/angular.min.js",
  "src/js/angular-cookies.min.js",
  "src/js/angular-messages.min.js",
  "src/js/angular-ui-router.min.js",
  "src/js/angular-animate.min.js",
  "src/js/ng-infinite-scroll.min.js",
  "src/js/underscore.min.js",
  "src/js/moment.min.js",
  "src/js/humanize-duration.js",
  "src/js/jquery.datetimepicker.full.js",
  "src/js/hammer.min.js",
  "src/js/angular.hammer.min.js",
  "src/js/angular-flash.min.js"
];

gulp.task('css', function () {
  return gulp.src(styles)
    .pipe(concat('styles.css'))
    .pipe(gulp.dest('public/style'))
    .pipe(rename('styles.min.css'))
    .pipe(minifyCss({ compatibility: 'ie8' }))
    .pipe(gulp.dest('public/style'));
});

gulp.task('app-scripts', function () {
  return gulp.src(appScripts)
    .pipe(ngAnnotate())
    .pipe(concat('app.js'))
    .pipe(gulp.dest('public/js'))
    .pipe(rename({ extname: '.min.js' }))
    .pipe(uglify())
    .pipe(gulp.dest('public/js'));
});

gulp.task('vendor-scripts', function () {
  return gulp.src(vendorScripts)
    .pipe(concat('applib.js'))
    .pipe(gulp.dest('public/js'))
    .pipe(rename('applib.min.js'))
    .pipe(uglify())
    .pipe(gulp.dest('public/js'));
});

gulp.task('lint', function () {
  return gulp.src(appScripts)
    .pipe(jshint())
    .pipe(jshint.reporter('default'));
});

gulp.task('watch', function() {
    gulp.watch(appScripts, ['lint', 'app-scripts']);
    gulp.watch(vendorScripts, ['vendor-scripts']);
    gulp.watch(styles, ['css']);
});

gulp.task('default', ['css', 'app-scripts', 'vendor-scripts', 'watch']);