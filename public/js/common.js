'use strict';

var ENTER_KEY = 13;
var newTodoDom = document.getElementById('new-todo');
var syncDom = document.getElementById('sync-wrapper');
var dbName = 'electricity-usage';
var settingsLocation = '_local/settings';

// var db = new PouchDB(dbName);
var remoteCouchTemplate = 'http://{0}:{1}@{2}:5984/{3}';
var remoteCouch = false;
var sync;
var enableDelete = true;

var db = new PouchDB(dbName);

$.datetimepicker.setLocale('en');
$('a[rel*=leanModal]').leanModal({ top: 100, closeButton: ".modal_close" });


// var checkurl = "/dummy.json" + "?" + Math.random();
// var checkConnectionStatus = function () {
// 	console.log("checking connection status...");
// 	$.ajax({
// 		url: checkurl,
// 		type: "HEAD",
// 		dataType: "json",
// 		timeout: 2000, //Wait 2 secs if connection problem
// 		async: true,
// 		success: function (data, status) {
// 			$('#status').attr('class', 'online');
// 		},
// 		error: function (x, t, m) {
// 			console.log("offline");
// 			$('#status').attr('class', 'offline');
// 		}
// 	});
// };

// checkConnectionStatus();

// function loadSettings() {
// 	console.log("loading settings...");
// 	db.get(settingsLocation).then(function (doc) {
// 		var settings = $.parseJSON(doc.value);
// 		settings.rev = doc._rev;
// 		console.log("settings:", settings);

// 		$('#server').val(settings.server);
// 		$('#database').val(settings.database);
// 		$('#username').val(settings.username);
// 		$('#password').val(settings.password);
// 		$('#electricity-rate').val(settings.electricityRate);
// 		//electricityRate = settings.electricityRate ? settings.electricityRate : 13;

// 		remoteCouch = String.format(remoteCouchTemplate,
// 			settings.username, settings.password, settings.server, settings.database);
// 		console.log(remoteCouch);
// 		if (settings.server != "" && settings.username != "" && settings.password != "" && settings.database)
// 			syncDB();

// 		//showEntries();
// 	}).catch(function (err) {
// 		console.log("loadSettings catch:", err);
// 	});
// }

// Initialise a sync with the remote server
  function syncDB() {
    console.log("sync db");
    if (sync != undefined) sync.cancel();

    //syncDom.setAttribute('data-sync-state', 'syncing');

    //log('syncing to ' + remoteCouch + '...');

    sync = db.sync(remoteCouch, {
      live: true,
      // retry: true
    }).on('change', function (info) {
      // handle change
    }).on('paused', function () {
      // replication paused (e.g. user went offline)
    }).on('active', function () {
      // replicate resumed (e.g. user went back online)
    }).on('denied', function (info) {
      // a document failed to replicate, e.g. due to permissions
      syncError();
    }).on('complete', function (info) {
      syncComplete();
    }).on('error', function (err) {
      syncError();
    });
  }

  function syncComplete() {
    //syncDom.setAttribute('data-sync-state', 'complete');
  }

  // EDITING ENDS HERE (you dont need to edit anything below this line)

  // There was some form or error syncing
  function syncError() {
    //syncDom.setAttribute('data-sync-state', 'error');
    sync.cancel();
    log('error syncing...');
  }