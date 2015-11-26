// Include gulp
var gulp = require('gulp'); 

// Include Our Plugins
var jshint = require('gulp-jshint');
// var sass = require('gulp-sass');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var minifyCss = require('gulp-minify-css');

// Concatenate & Minify CSS
gulp.task('minify-css', function () {
  return gulp.src([
    "public/style/jquery.datetimepicker.css",
    "public/style/angular-flash.min.css",
    "public/style/normalize.css",
    "public/style/fonts.css",
    "public/style/base.css",
  ])
    .pipe(concat('styles.css'))
    .pipe(gulp.dest('public/style'))
    .pipe(rename('styles.min.css'))
    .pipe(minifyCss({ compatibility: 'ie8' }))
    .pipe(gulp.dest('public/style'));
});

// Concatenate & Minify JS
gulp.task('scripts', function () {
  return gulp.src([
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
    "src/js/angular-flash.min.js",
  ])
    .pipe(concat('applib.js'))
    .pipe(gulp.dest('public/js'))
    .pipe(rename('applib.min.js'))
    .pipe(uglify())
    .pipe(gulp.dest('public/js'));
});

// Lint Task
// gulp.task('lint', function() {
//     return gulp.src('src/js/*.js')
//         .pipe(jshint())
//         .pipe(jshint.reporter('default'));
// });

// Compile Our Sass
// gulp.task('sass', function() {
//     return gulp.src('scss/*.scss')
//         .pipe(sass())
//         .pipe(gulp.dest('css'));
// });

// Watch Files For Changes
// gulp.task('watch', function() {
//     gulp.watch('public/js/app.js', ['lint']);
//     // gulp.watch('scss/*.scss', ['sass']);
// });

// Default Task
gulp.task('default', ['scripts', 'minify-css']);