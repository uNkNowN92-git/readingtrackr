(function () {

	'use strict';

	var app = angular.module('electricityUsageApp',
		['ui.router', 'infinite-scroll', 'hmTouchEvents', 'flash', 'ngAnimate', 'ngCookies', 'ngMessages'])

		.config(["$stateProvider", "$urlRouterProvider", function ($stateProvider, $urlRouterProvider) {
			$urlRouterProvider.otherwise('/');

			$stateProvider
				.state('summary', {
					url: '/summary',
					templateUrl: 'partials/summary.html',
					controller: 'SummaryController',
					controllerAs: 'summary'
				})
				.state('home', {
					url: '/',
					templateUrl: 'partials/data.html',
					controller: 'DataController',
					controllerAs: 'data'
				})
				.state('settings', {
					url: '/settings',
					templateUrl: 'partials/settings.html',
					controller: 'MainController'
				})
			;
		}])

		.run(["$rootScope", "$state", "$stateParams", "$cookies", "data", function ($rootScope, $state, $stateParams, $cookies, data) {
			var id = $cookies.get('guid');
			if (!id) {
				$cookies.put('guid', guid());
			}
			
			function guid() {
				function s4() { return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1); }
				return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
			}
			
			$rootScope.$state = $state;
    	$rootScope.$stateParams = $stateParams; 
			
			$rootScope.$on('$stateChangeSuccess',
				function(event, toState, toParams, fromState, fromParams) {
					// $rootScope.$state.current = toState;
					$rootScope.$state.previous = fromState;
					// console.log($rootScope.$state.previous);
				}
			);
		}])

		.factory('Scopes', ["$rootScope", "$cookies", function ($rootScope, $cookies) {
			var mem = {};

			function suffixed(key) {
				return key + '-' + $cookies.get('guid');
			}

			return {
				store: function (key, value) {
					key = suffixed(key);
					$rootScope.$broadcast('scope.stored', { key: key, value: value });
					mem[key] = value;
				},
				get: function (key) {
					key = suffixed(key);
					return mem[key];
				},
				remove: function (key) {
					key = suffixed(key);
					delete mem[key];
				}
			};
		}])

		.filter('humanizeDuration', ["$sce", function ($sce) {
			return function (duration) {
				duration = parseInt(duration / 1000) * 1000;
				if (duration) {
					duration = humanizeDuration(duration, { largest: 2, delimiter: "," });
					var durations = duration.split(",");
					var el = [];
					angular.forEach(durations, function (d) {
						el.push('<span class="no-wrap">' + d + '</span>');
					});
					return $sce.trustAsHtml(el.join(" and "));
				} else return null;
			};
		}])
		
		.filter("dateFilter", function() {
			return function(items, from, to) {
				if (!from && !to) return items;
				
				var df = new Date(from) || new Date();
				var dt = new Date(to) || new Date();
				var arrayToReturn = [];
				
				df = moment(df.getTime()).toDate().valueOf();
				dt = moment(dt.getTime()).add(1, 'days').toDate().valueOf();
				
				for (var i=0; i<items.length; i++){
						var dateTime = parseInt(items[i]._id);
						
						if (dateTime >= df)  {
							if (!dt || (dt && dateTime <= dt))
								arrayToReturn.push(items[i]);
						} else if (dateTime <= dt) {
							if (!df || (df && dateTime >= df))
								arrayToReturn.push(items[i]);
						}
				}
				return arrayToReturn;
			};
		})
		
		.filter('rangeFilter', function() {
			return function( items, range ) {
				if (!range) return items;
				
				var filtered = [];
				var min = parseFloat(range.min || 0);
				var max = parseFloat(range.max) || (items.length ? Math.max.apply(null, _.pluck(items, 'reading')) : false);
				
				angular.forEach(items, function(item) {					
					if( item.reading >= min && (!max || item.reading <= max ))  {
						filtered.push(item);
					}
				});
				return filtered;
			};
		})

		.filter('reverse', function () {
			return function (items) {
				if (!items) return;
				return items.slice().reverse();
			};
		})

		.service('db', function () {
			var dbName = "electricity-usage";
			var db = new PouchDB(dbName, { auto_compaction: true });

			return db;
		})

		.factory('util', ["$q", "$rootScope", function ($q, $rootScope) {
			return {
				resolve: function (value) {
					$rootScope.$apply(function () {
						return $q.when(value);
					});
				},
				reject: function (error) {
					$rootScope.$apply(function () {
						return $q.reject(error);
					});
				}
			};
		}])

		.factory('data', ["$rootScope", "$cookies", "db", "util", "dataService", "Scopes", function ($rootScope, $cookies, db, util, dataService, Scopes) {
			var data = [];
			var settings = {};
			var dbConnection = false;
			var sync;

			function login() {
				if ($.isEmptyObject(settings)) return false;

				var remoteCouchTemplate = 'http://{0}:5984/{1}';
				var remoteCouch;

				remoteCouch = String.format(remoteCouchTemplate, settings.server, settings.database);

				var user = {
					name: settings.username,
					password: settings.password
				};

				var pouchOpts = { skipSetup: true };

				var ajaxOpts = {
					ajax: {
						headers: { Authorization: 'Basic ' + window.btoa(user.name + ':' + user.password) }
					}
				};
				// console.log(remoteCouch);

				var remoteDB = new PouchDB(remoteCouch, pouchOpts);
				remoteDB.login(user.name, user.password, ajaxOpts, function (err, response) {
					// console.log('login');
					
					if (err) {
						var errorMessage;
						switch (err.status) {
							case 401:
								errorMessage = err.message;
								break;
							default:
								errorMessage = " Cannot connect to specified server or database. Please check your settings and try again.";
								break;
						}
						//alert(String.format("Error! {0}", errorMessage));
						if (settings.enableSync || settings.server && settings.database)
							Scopes.store('flashMessage', { severity: 'danger',
								title: String.format('Error {0}!', err.status),
								message: String.format('{0}<br>{1}', errorMessage, err.message) });
						
						Scopes.store('dbStatus', {
							// enableSync: true,
							dbConnection: false
						});
						return false;
					}
				}).then(function (response) {
					if (response) {
						var roles = [];
						angular.forEach(response.roles, function (role) { return roles.push(role.substring(1)); });

						Scopes.store('userRoles', roles);
					}
					
					if (!settings.enableSync) {
						if (sync) sync.cancel();
						
						Scopes.store('flashMessage', {
							severity: 'info',
							title: 'Info: ',
							message: 'You can now sync your data to the server.' });
						
						//$rootScope.$apply(function () {
							//dbConnection = true;
						//});
						Scopes.store('dbStatus', {
							dbConnection: true
						});
					} else syncDB();
				}).catch(function (err) { });

			}

			function syncDB() {
				console.log("sync");

				var remoteCouchTemplate = 'http://{0}:{1}@{2}:5984/{3}';
				var remoteCouch = String.format(remoteCouchTemplate, settings.username, settings.password, settings.server, settings.database);

				// console.log("sync", remoteCouch);

				$rootScope.$apply(function () {
					sync = db.sync(remoteCouch, {
						live: true,
						filter: function (doc) {
							return doc.type === 'reading' || doc._deleted;
						}
					}).on('paused', function () {
						dbConnection = true;
						Scopes.store('dbStatus', {
							// enableSync: false,
							dbConnection: dbConnection
						});
						Scopes.store('flashMessage', {title: 'Success!', message: 'Database sync successful.', severity: 'success', append: true });
						
						// console.log('paused');
					}).on('active', function () {
						// console.log('active');
						Scopes.store('flashMessage', {title: '', message: 'Syncing...', severity: 'info', append: true });
						
						// dbConnection = true;
					}).on('denied', function (info) {
						console.log('denied', info);
						// dbConnection = false;
					}).on('complete', function (info) {
						// console.log(info);
						// enableSync = true;
						// dbConnection = true;
						// Scopes.store('dbStatus', {
						// 	// enableSync: enableSync,
						// 	dbConnection: dbConnection
						// });
					}).on('error', function (err) {
						dbConnection = false;
						Scopes.store('dbStatus', {
							// enableSync: false,
							dbConnection: dbConnection
						});
						console.log("error!", err);
					});
				});

				//console.log(sync);
				//$rootScope.$apply(function () {
				// Scopes.store('dbStatus', {
				// 	enableSync: false,
				// 	dbConnection: dbConnection
				// });
				//});
			}

			function fetchInitialDocs() {
				return db.allDocs({
					include_docs: true,
					descending: true
				})
					.then(function (response) {
						var docs = response.rows.map(function (row) { return row.doc; });
						// console.log(docs);

						angular.forEach(docs, function (doc, key) {
							switch (doc.type) {
								case 'reading':
									data.push(doc);
									break;
								case 'settings':
									if (doc._id == 'settings-' + $cookies.get('guid')) {
										$.extend(settings, doc);
										Scopes.store('settings', settings);
									}
							}
						});
						data.sort(compare);
						$rootScope.$apply();
						Scopes.store('dataLoaded', true);
						login();
					});
			}

			function reactToChanges() {
				db.changes({ live: true, since: 'now', include_docs: true })
					.on('change', function (change) {
						if (change.deleted) {
							// $rootScope.$apply(function () {
							onDeleted(change.id);
							// });
						} else {
							onUpdatedOrInserted(change.doc);
						}
					}).on('error', console.log.bind(console));
			}

			function onDeleted(id) {
				switch (id) {
					case 'settings-' + $cookies.get('guid'):
						$rootScope.$apply(function () {
							settings = {};
						});
						Scopes.store('settings', settings);
						break;
					default:
						var index = getIndex(data, id);
						var doc = data[index];
						if (doc && doc._id === id) {
							$rootScope.$apply(function () {
								data.splice(index, 1);
							});
						}
						break;
				}
			}

			function onUpdatedOrInserted(newDoc) {
				// console.log(newDoc);
				switch (newDoc.type) {
					case 'reading':
						var index = getIndex(data, newDoc._id);
						var curnewDoc = data[index];
						$rootScope.$apply(function () {
							if (curnewDoc && curnewDoc._id === newDoc._id) {
								data.splice(index, 1, newDoc);
								// data[index] = newDoc;
							} else {
								data.splice(index, 0, newDoc);
								data.sort(compare);
							}
						});
						break;
					case 'settings':
						// console.log("here", 'settings-' + $cookies.get('guid') == newDoc._id, $cookies.get('guid'), newDoc._id);
						if ('settings-' + $cookies.get('guid') == newDoc._id) {
							$rootScope.$apply(function () {
								$.extend(settings, newDoc);
							});
							Scopes.store('settings', settings);
							// console.log(settings);
							login();
						}
						break;
					default:
						console.log(newDoc.reading);
						// if (newDoc.reading) {
						// 	newDoc.type = 'reading';
						// 	//tempDocs.push(newDoc);
							
						// 	db.put(newDoc).then(function(res) {
						// 		console.log(res);
						// 	}).catch(function(err) {
						// 		console.log(err);
						// 	});
						// }
						break;
				}
			}

			fetchInitialDocs().then(reactToChanges).catch(console.log.bind(console));

			return {
				dbConnection: dbConnection,
				docs: data,
				settings: settings,
				syncDB: login,
				put: function (doc, showFlash) {
					showFlash = showFlash === undefined ? true : showFlash;
					return db.put(doc, function(err) {
						if (showFlash) {
							if (err) {
								console.log(err, doc);
								var errorMessage;
								switch (err.name) {
									case 'conflict':
										if (doc.type == 'reading') {
											errorMessage = String.format('An entry with same date and time <span class="no-wrap"><b>({0})</b></span> already exists.',
												moment(parseInt(doc._id)).format('MMM D, YYYY h:mm A'));
										} else{
											errorMessage = 'Entry already exists.';
										}
										break;
									default:
										errorMessage = 'Something wrong happened.';
										break;
								}
								Scopes.store('flashMessage', { title: 'Error!', message: errorMessage, severity: 'danger', pause: true, repeat: true });
							} else {
								var dbStatus = Scopes.get('dbStatus');
								if (dbStatus === undefined || !dbStatus.dbConnection || !settings.enableSync) {
									var message = "";
									switch (doc.type) {
										case 'settings':
											message = "Settings saved successfully!";
											break;
										default:
											message = "Entry saved successfully!";
											break;
									}
									Scopes.store('flashMessage', { title: 'Success!', message: message, severity: 'success', repeat: true });
								}
							}
						}
					})
					.then(util.resolve)
					.catch(util.reject);
				},
				get: function (docId) {
					return db.get(docId)
						.then(function (doc) {
							return doc;
						})
						.catch(util.reject);
				},
				delete: function (doc, showFlash) {
					showFlash = showFlash === undefined ? true : showFlash;
					return db.get(doc._id)
						.then(function (doc) {
							return db.remove(doc)
								.then(function() {
									if (showFlash) {
										var message = "";
										switch (doc.type) {
											case 'reading':
												message = String.format("Entry with reading of <b>{0}</b> dated <no-wrap><b>{1}</b></no-wrap> <no-wrap><b>{2}</b></no-wrap> was deleted successfully!",
													doc.reading, moment(parseInt(doc._id)).format('MMM D, YYYY'), moment(parseInt(doc._id)).format('h:mm A'));
												break;
											default:
												message = "Entry was deleted successfully!";
												break;
										}
										Scopes.store('flashMessage', { title: 'Success!', message: message, severity: 'success', repeat: true });
									}
									util.resolve();
								}, util.reject);
						})
						.catch(util.reject);
				}
			};
		}])

		.service('flashMessage', ["Flash", "$timeout", function(Flash, $timeout){
			return {
				create: function(flash) {
					Flash.dismiss();
					$timeout(function() {
						Flash.create(flash.severity, '<strong>'+ flash.title + '</strong>&nbsp;&nbsp;' + flash.message, flash.class);
					}, 100);
				},
				pause: function() {
					Flash.pause();
				}
			};
		}])

		.service('dataService', ["Scopes", "$cookies", function (Scopes, $cookies) {
			var settings, electricityRate;

			function getSettings() {
				settings = Scopes.get('settings');
				// console.log(settings);
				electricityRate = settings ? settings.electricityRate : 13;
				electricityRate = electricityRate || 13;
			}

			return {
				calculate: function (docs) {
					getSettings();

					angular.forEach(docs, function (doc, key) {
						var previousDoc = docs[key + 1];
						if (!previousDoc) {
							doc.elapsedTime = "-";
							doc.usage = "-";
							doc.cost = "-";
							doc.aveUsagePerHour = "-";
							doc.aveCostPerHour = "-";
						} else {
							doc.duration = doc._id - previousDoc._id;
							doc.usage = doc.reading - previousDoc.reading;
							doc.cost = doc.usage * electricityRate;
							doc.aveUsagePerHour = doc.usage / (doc.duration / 3600000);
							doc.aveCostPerHour = doc.aveUsagePerHour * electricityRate;
						}
					});

					return docs;
				},
				getSummary: function (start, end) {
					if (!start) return;
					
					var summary = {};
					getSettings();

					summary.startDateTime = start._id;
					summary.endDateTime = end._id;
					summary.startReading = start.reading;
					summary.latestReading = end.reading;
					summary.electricityRate = electricityRate;
					summary.currentUsage = end.reading - start.reading;
					summary.elapsedTime = parseInt(end._id) - parseInt(start._id);
					summary.currentCost = summary.currentUsage * summary.electricityRate;

					var days = summary.elapsedTime / (3600000 * 24);

					summary.aveUsagePerDay = days >= 1 ? summary.currentUsage / days : summary.currentUsage;
					summary.aveCostPerDay = days >= 1 ? summary.currentCost / days : summary.currentCost;

					return summary;
				}
			};
		}])

		.controller('MainController', ["$scope", "$cookies", "db", "data", "Scopes", "flashMessage", function ($scope, $cookies, db, data, Scopes, flashMessage) {

			var flashDuration = 3500;
			// $scope.appName = ".";
			$scope.appName = "reading-trackr";
			$scope.title = $scope.appName + " App";
			$scope.flashDuration = flashDuration;
			$scope.serverPlaceholder = window.location.hostname;
			$scope.defaultElectricityRate = "Default: P 13.00";

			// $scope.setTitle = function (pageTitle) {
			// 	//console.log(pageTitle);
			// 	//$scope.title = pageTitle ? pageTitle + " | " + $scope.appName : $scope.appName;
			// }
						
			var currentYear = new Date().getFullYear();
			var copyrightYears = currentYear != 2015 ? 2015 + " - " + currentYear : 2015;
			$scope.footerText = String.format("© {0} Electricity Reading Trackr App | uNkNowN92", copyrightYears);

			$scope.settings = data.settings;
			
			$scope.syncDB = function () {
				toggleDbSync();
			};

			function toggleDbSync() {
				$scope.settings.enableSync = !$scope.settings.enableSync;
				
				data.put($scope.settings).then(function (res) {
					data.get(settings._id).then(function (doc) {
						$scope.$apply(function () {
							$.extend(data.settings, doc);
							$scope.settings = data.settings;
						});
						if ($scope.settings.enableSync)
							Scopes.store('flashMessage', {title: '', message: 'Database sync started.', severity: 'info'});
						else
							Scopes.store('flashMessage', {title: '', message: 'Stopping database sync...', severity: 'info'});
					});
				}, function (err) { console.log(err); });
			}

			$scope.previousFlash = {};
			$scope.$on('scope.stored', function (event, storedData) {
				$scope.$apply(function () {
					switch (storedData.key) {
						case 'dbStatus-' + $cookies.get('guid'):
							$scope.dbConnection = storedData.value.dbConnection;

							if(!$scope.dbConnection && $scope.settings.enableSync)
								toggleDbSync();

							break;
						case 'flashMessage-' + $cookies.get('guid'):
							var obj = {
								severity: storedData.value.severity,
								title: storedData.value.title,
								message: storedData.value.message
							};
							
							// if (storedData.value.append) {
							// 	var messages = [];
							// 	if ($scope.previousFlash.message)
							// 		messages.push($scope.previousFlash.message);
							// 	if ($scope.previousFlash.message != obj.message)
							// 		messages.push(obj.message);
							// 	obj.message = messages.join('<br>');
							// }
							
							if(!_.isEqual(obj, $scope.previousFlash) || storedData.value.repeat) {
								flashMessage.create(obj);
								if (storedData.value.pause)
									flashMessage.pause();
								$scope.previousFlash = obj;
							}
							break;
					}
				});
			});

			var settings = {
				_id: 'settings-' + $cookies.get('guid'),
				type: 'settings'
			};

			$scope.saveSettings = function () {
				var newSettings = settings;
				$.extend(newSettings, $scope.settings);
				data.put(newSettings).then(function (res) {
					data.get(settings._id).then(function (doc) {
						$scope.$apply(function () {
							$.extend(data.settings, doc);
							$scope.settings = data.settings;
						});
						Scopes.store('flashMessage', {title: 'Success!', message: 'Settings saved successfully!', severity: 'success'});
					});
				}, function (err) { console.log(err); });
			};

			$scope.resetSettings = function () {
				data.get(settings._id).then(function (doc) {
					doc.server = null;
					doc.database = null;
					doc.username = null;
					doc.password = null;
					doc.electricityRate = null;
					data.put(doc).then(function () {
						$scope.$apply(function () {
							$scope.settings = data.settings;
							$scope.settingsForm.$setPristine();
						});
						Scopes.store('flashMessage', {title: 'Success!', message: 'Settings cleared successfully!', severity: 'success'});
					});
				}).catch(function (err) { console.log(err); });
			};

		}])

		.controller('DataController', ["$scope", "data", "dataService", "Scopes", "$filter", function ($scope, data, dataService, Scopes, $filter) {
			$scope.docs = data.docs;
			$scope.focusReading = [];
			$scope.focusDateTime = [];
			$scope.editedReading = [];
			$scope.editedDateTime = [];
			$scope.editedStartOfMonth = [];
			$scope.limit = 10;
			
			$scope.loadMore = function () {
				if ($scope.limit < $scope.docs.length)
					$scope.limit += 10;
			};

			$scope.beginEditing = function (id, element) {
				var index = getIndex($scope.docs, id);
				var doc = $scope.docs[index];
				$scope.index = index;
				$scope.focusReading[index] = element == 'reading';
				$scope.focusDateTime[index] = element == 'dateTime';
				$scope.editingId = id;
				$scope.editedReading[index] = parseFloat(doc.reading).toFixed(1);
				$scope.editedDateTime[index] = $filter('date')(doc._id, 'mediumDate') + " " + $filter('date')(doc._id, 'shortTime');
				$scope.editedStartOfMonth[index] = doc.startOfMonth ? true : '';
				
				$.datetimepicker.setLocale('en');
				$('#' + id).datetimepicker({ format: 'M j, Y h:i A', step: 15, value: new Date(parseInt(doc._id)) });
			};

			$scope.editReading = function (docId) {
				var index = $scope.index;
				var updatedDoc = {
					_id: new Date($scope.editedDateTime[index]).getTime().toString(),
					reading: parseFloat($scope.editedReading[index]),
					startOfMonth: $scope.editedStartOfMonth[index] === true,
				};
				updatedDoc._id = removeSeconds(updatedDoc._id);

				data.get(docId).then(function (doc) {
					if (updatedDoc._id != doc._id) {
						data.delete(doc, false).catch(function (reason) { console.log(reason); });
						var newDoc = { type: 'reading' };
						$.extend(newDoc, updatedDoc);
						data.put(newDoc).then(function (res) { 
							resetEditedItem(index);
						}, function (err) { console.log(err); });
					}
					else if (updatedDoc.reading != doc.reading) {
						$.extend(doc, updatedDoc);
						data.put(doc).then(function (res) {
							resetEditedItem(index);
						}, function (err) { console.log(err); });
					}
					else if (updatedDoc.startOfMonth != doc.startOfMonth) {
						var withSameMonth = $scope.docs.sameMonth(updatedDoc._id);
						var previousStartOfMonth = withSameMonth.startOfMonth();
						
						angular.forEach(previousStartOfMonth, function(entry) {
							entry.startOfMonth = false;
							data.put(entry, false).then(function (res) { }, function (err) { console.log(err); });
						});
						
						$.extend(doc, updatedDoc);
						data.put(doc).then(function (res) {
							resetEditedItem(index);
						}, function (err) { console.log(err); });
					} else {
						resetEditedItem(index);
					}
				});
			};
			
			function resetEditedItem(index) {
				$scope.editedReading[index] = null;
				$scope.editedDateTime[index] = null;
				delete $scope.editingId;
				closeDateTimePicker();
				$scope.$apply();
			}
			
			function closeDateTimePicker() {
				$('.xdsoft_datetimepicker').fadeOut();
			}
			
			$scope.closeDateTimePicker = function() {
				closeDateTimePicker();
			};

			$scope.addNewDoc = function () {

				// for (var i = 0; i < 50; i++) {
				// 	$scope.dateTime = Math.random() * 1447039080000;
				// console.log("new");				
				var newDoc = {
					type: 'reading',
					_id: removeSeconds($scope.dateTime || new Date().getTime().toString()),
					reading: parseFloat($scope.newReading).toFixed(1),
					startOfMonth: $scope.startOfMonth || false,
				};

				data.put(newDoc).then(function (res) {
					$scope.$apply(function () {
						$scope.newReading = '';
					});
				}, function (err) {
					console.log(err);
				});

			// };
			};


			$scope.deleteDoc = function (doc) {
				if(confirm("Are you sure you want to delete this entry?"))
				data.delete(doc, true)
					.catch(function (reason) {
						console.log(reason);
					});
			};

			function removeSeconds(dateTime) {
				dateTime = parseInt(dateTime);
				dateTime = $filter('date')(dateTime, 'mediumDate') + " " + $filter('date')(dateTime, 'shortTime');
				return new Date(dateTime).getTime().toString();
			}
			
			$scope.windowWidth = window.innerWidth;
			$(window).resize(function () {
				$scope.$apply(function () {
					$scope.windowWidth = window.innerWidth;
				});
			});
		}])

		.controller('SummaryController', ["$scope", "$cookies", "data", "Scopes", "dataService", "$filter", function ($scope, $cookies, data, Scopes, dataService, $filter) {
			$scope.docs = data.docs;
			$scope.limit = 10;

			$scope.resetLimit = function() {
				$scope.limit = 10;
			};
			
			$scope.settings = data.settings;
			$scope.startReadings = data.settings.startReadings;
			$scope.selectedStartReading = getStartReading();
			$scope.readingRange = {};
			
			var settings = {
				_id: 'settings-' + $cookies.get('guid'),
				type: 'settings'
			};
		
			getStartReadings();
			
			$scope.$on('scope.stored', function (event, storedData) {
				$scope.$apply(function () {
					switch (storedData.key) {
						case 'dataLoaded-' + $cookies.get('guid'):
							getStartReadings();
							break;
					}
				});
			});
			
			$scope.updateStartReading = function() {
				var newDoc = {};
				newDoc.startReading = $scope.selectedStartReading._id;
				$.extend(newDoc, settings);
				data.get(settings._id).then(function(doc) {
					delete doc.startReading;
					$.extend(newDoc, doc);
					data.put(newDoc, false).then(function() {
						updateFilters();
						$scope.$apply();
					});
				});
			};
			
			function getStartReadings() {
				var startReadings = _.map($scope.docs.startOfMonth(),
					function(doc) {
						return { _id: doc._id, reading: doc.reading };
					}
				);
					
				var readings = [{ value: 'All', _id: 0 }];
				
				angular.forEach(startReadings, function(doc, index) {
					var next = startReadings[index - 1];
					var obj = {
						value: String.format("{0} ({1})",
							$filter('number')(doc.reading, 1), $filter('date')(doc._id, 'mediumDate')),
						_id: doc._id,
						dateFrom: $filter('date')(doc._id, 'mediumDate'),
						dateTo: next ? $filter('date')(next._id, 'mediumDate') : '', 
						startReading: doc.reading,
						endReading: next ? next.reading : ''
					};
						readings.push(obj);
				});
				
				if (isStartReadingsChanged(readings)) {
					$scope.startReadings = readings;
					updateStartReadings();
				}
					
				$scope.selectedStartReading = getStartReading();
				updateFilters();
			}
			
			function isStartReadingsChanged(readings) {
				if (!$scope.startReadings) return true;
				var changed = false;
				for (var key = 0; key < readings.length; key++) {
					var value = readings[key];
					var oldCopy = $scope.startReadings[key] || {};
					delete oldCopy.$$hashKey;
					if (!_.isEqual(value, oldCopy)) {	changed = true; break; }
				}
				return changed;
			}
			
			function getStartReading() {
				var index = getIndex($scope.startReadings, $scope.settings.startReading);
				return $scope.startReadings ? $scope.startReadings[index] || $scope.startReadings[0] : '';
			}

			function updateStartReadings() {
				var newDoc = {};
				$.extend(newDoc, settings);
				data.get(settings._id).then(function(doc) {
					$.extend(newDoc, doc);
					newDoc.startReadings = $scope.startReadings;
					data.put(newDoc, false);
				});
			}
			
			function updateFilters() {
				$scope.readingRange.min = $scope.selectedStartReading.startReading || "";
				$scope.readingRange.max = $scope.selectedStartReading.endReading || "";
				$scope.dateFrom = $scope.selectedStartReading.dateFrom || "";
				$scope.dateTo = $scope.selectedStartReading.dateTo || "";
			}
			
			$scope.loadMore = function (override, limit) {
				if (limit) $scope.limit = limit;
				else {
					if ($scope.limit < $scope.docs.length && $scope.windowWidth > 800 || override)
						$scope.limit += 10;
				}
			};
			
			$scope.downloadResultJson = function() {
				//console.log(JSON.stringify($scope.filteredReadings));
				//var limit = $scope.limit;
				
				
				//$scope.limit = $scope.filteredReadings.length;
				//console.log($scope.limit);
				//console.log($('#table-summary').html());
				//$scope.limit = limit;
			};

			$scope.getSummary = function () {
				var end, start, summary;
				
				if ($scope.dateFrom || $scope.dateTo || $scope.readingRange) {
					if ($.isEmptyObject($scope.filteredDates)) return;
					
					start = $scope.readingRange.min ?
						$scope.filteredDates.getIndexByReading($scope.readingRange.min) :
						$scope.filteredDates[0];
						
					if ($scope.dateTo && !$scope.readingRange.max) {
						end = $scope.filteredDates[$scope.filteredDates.length - 1];
					}
					else if ($scope.readingRange.max) {
						end = $scope.docs.getIndexByReading($scope.readingRange.max);
					}
					else {
						end = $scope.docs[0];
					}
					
					summary = dataService.getSummary(start, end);
				} else {
					if ($.isEmptyObject($scope.docs)) return;
					
					start = $scope.docs[$scope.docs.length - 1];
					end = $scope.docs[0];
					summary = dataService.getSummary(start, end);
				}

				$.extend($scope, summary);
				$scope.docs = dataService.calculate($scope.docs);
			};

			$scope.windowWidth = window.innerWidth;
			$(window).resize(function () {
				$scope.$apply(function () {
					$scope.windowWidth = window.innerWidth;
				});
			});
		}])
		
		.directive('datetimePicker', ["$timeout", function($timeout) {
			return {
				restrict: 'A',
				link: function (scope, element, attrs) {
					var opts = { value: new Date() };
					var extraOpts = {};
					switch (attrs.datetimePicker) {
						case 'date':
							extraOpts.timepicker = false;
							extraOpts.datepicker = true;
							extraOpts.format = 'M j, Y';
							break;
						case 'time':
							extraOpts.timepicker = true;
							extraOpts.datepicker = false;
							extraOpts.format = 'h:i A';
							extraOpts.step = 15;
							break;
						default:
							extraOpts.format = 'M j, Y h:i A';
							extraOpts.step = 15;
							break;
					}
					$.extend(opts, extraOpts);
					$('[datetime-picker=\"'+attrs.datetimePicker+'\"]').datetimepicker(opts);
				}
			};
		}])

		.directive('navbar', function () {
			return {
				restrict: 'E',
				templateUrl: 'partials/navbar.html',
				controller: 'MainController'
			};
		})
		
		.directive('copyright', function () {
			return {
				restrict: 'E',
				templateUrl: 'partials/copyright.html',
				controller: 'MainController'
			};
		})

		.directive('notification', ["$timeout", function ($timeout) {
			return {
				restrict: 'E',
				template:"<div class='alert alert-{{alertData.type}}' ng-show='alertData.message' role='alert' data-notification='{{alertData.status}}'>{{alertData.message}}</div>",
				scope:{
					alertData:"="
				}
			};
		}])

		.directive('validateFloat', function () {

			var FLOAT_REGEXP = /^\-?\d+((\.|\,)\d{0,1})?$/;

			return {
				require: "ngModel",
				link: function (scope, elm, attrs, ngModelController) {

					ngModelController.$parsers.unshift(function (viewValue) {
						if (viewValue === '') {
							ngModelController.$setValidity('float', true);
							return viewValue;
						}

						if (FLOAT_REGEXP.test(viewValue)) {
							ngModelController.$setValidity('float', true);
							return parseFloat(viewValue.replace(',', '.'));
						}

						ngModelController.$setValidity('float', false);
						return undefined;
					});
				}
			};
		})

		.directive('autoFocus', ["$timeout", function ($timeout) {
			return {
				restrict: 'AC',
				link: function (_scope, _element) {
					$timeout(function () {
						_element[0].focus();
					}, 0);
				}
			};
		}])

		.directive('focus', ["$timeout", function ($timeout) {
			return {
				scope: {
					trigger: '=focus'
				},
				link: function (scope, element) {
					scope.$watch('trigger', function (value) {
						if (value === true) {
							$timeout(function () {
								element[0].focus();
							}, 250);
						}
					});
				}
			};
		}])
		
		.directive('onShow', function () {
			// TODO
			// return {
			// 	scope: {
			// 		trigger: '=focus'
			// 	},
			// 	link: function (scope, element, attrs) {
			// 		scope.$watch('trigger', function (value) {
			// 			if (value === true) {
			// 				$timeout(function () {
			// 					element[0].focus();
			// 				}, 250);
			// 			}
			// 		});
			// 	}
			// };
		})

		// .directive('whenScrollEnds', function() {
	//     return {
	//       restrict: "A",
	//       link: function(scope, element, attrs) {
	//       	//console.log(scope, element, attrs.whenScrollEnds);
	//         var windowHeight = $(window.top).height();;
	//         var threshold = 100;

	//         function getVisible() {    
		// 			    var $el = element,
		// 			        scrollTop = $(this).scrollTop(),
		// 			        scrollBot = scrollTop + $(this).height(),
		// 			        elTop = $el.offset().top,
		// 			        elBottom = elTop + $el.outerHeight(),
		// 			        visibleTop = elTop < scrollTop ? scrollTop : elTop,
		// 			        visibleBottom = elBottom > scrollBot ? scrollBot : elBottom;
		// 			    $('#notification').text(visibleBottom - visibleTop);
		// 			    console.log(windowHeight, elTop, visibleBottom, visibleTop, visibleBottom - visibleTop);
		// 			}

		// 			$(window).on('scroll resize', getVisible);
	//         // console.log(element.scroll());
	//         // $(document).scroll(function() {
	//         //   var scrollableHeight = $(document).height();
	//         //   var hiddenContentHeight = scrollableHeight - visibleHeight;
	//         // 	console.log(visibleHeight, scrollableHeight, hiddenContentHeight);

	//         //   if (hiddenContentHeight - element.scrollTop() <= threshold) {
	//         //     // Scroll is almost at the bottom. Loading more rows
	//         //     scope.$apply(attrs.whenScrollEnds);
	//         //   }
	//         // });
	//       }
	//     };
	//   })
		;

	// Helpers

	String.format = function () {
		var s = arguments[0];
		for (var i = 0; i < arguments.length - 1; i++) {
			var reg = new RegExp("\\{" + i + "\\}", "gm");
			s = s.replace(reg, arguments[i + 1]);
		}
		return s;
	};
	Array.prototype.getIndexByReading = function (value) {
		return _.map(_.where(this, { 'reading': value }))[0];
	};
	
	Array.prototype.startOfMonth = function () {
		return _.map(_.where(this, { 'startOfMonth': true }));
	};

	Array.prototype.sameMonth = function (id) {
		var month = moment(parseInt(id)).get('month');
		var year = moment(parseInt(id)).get('year');
		var startDate = moment([year, month]).toDate().valueOf();
		var endDate = moment(startDate).endOf('month').toDate().valueOf();

		return _.filter(this, function(e) {
			return e._id >= startDate && e._id <= endDate && e._id != id;
		});
	};

	function compare(a, b) {
		return b._id - a._id;
	}

	function getIndex(data, docId) {
		if (!data) return;
		var indexes = $.map(data, function (obj, index) {
			if (obj._id == docId) {
				return index;
			}
		});
		return indexes[0];
	}


})();