(function () {

	'use strict';

	var app = angular.module('electricityUsageApp',
		['ui.router', 'infinite-scroll', 'hmTouchEvents', 'flash', 'ngAnimate', 'ngCookies', 'ngMessages'])

		.config(function ($stateProvider, $urlRouterProvider) {
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
		})

		.run(function ($rootScope, $state, $stateParams, $cookies, data) {
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
			)
		})

		.factory('Scopes', function ($rootScope, $cookies) {
			var mem = {};

			function suffixed(key) {
				return key + '-' + $cookies.get('guid');
			}

			return {
				store: function (key, value) {
					key = suffixed(key);
					$rootScope.$emit('scope.stored', { key: key, value: value });
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
		})

		.filter('humanizeDuration', function ($sce) {
			return function (duration) {
				duration = parseInt(duration / 1000) * 1000;
				if (duration) {
					duration = humanizeDuration(duration, { largest: 2, delimiter: "," });
					var durations = duration.split(",");
					var el = [];
					angular.forEach(durations, function (d) {
						el.push('<span class="no-wrap">' + d + '</span>');
					})
					return $sce.trustAsHtml(el.join(" and "));
				} else return null;
			}
		})
		
		.filter("dateFilter", function() {
			return function(items, from, to) {
				if (!from && !to) return items;
				
				var df = new Date(from) || new Date();
				var dt = new Date(to) || new Date();
				var arrayToReturn = [];
				df = df.getTime();
				dt = dt.getTime();
				
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

		.factory('util', function ($q, $rootScope) {
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
		})

		.factory('data', function ($rootScope, $cookies, db, util, dataService, Scopes) {
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
						angular.forEach(response.roles, function (role) { return roles.push(role.substring(1)) });

						Scopes.store('userRoles', roles);
					}
					
					if (!settings.enableSync) {
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
						Scopes.store('flashMessage', {title: 'Success!', message: 'Database sync successful.', severity: 'success'});
						
						console.log('paused');
					}).on('active', function () {
						console.log('active');
						Scopes.store('flashMessage', {title: '', message: 'Syncing...', severity: 'info'});
						
						// dbConnection = true;
					}).on('denied', function (info) {
						console.log('denied', info)
						// dbConnection = false;
					}).on('complete', function (info) {
						console.log(info);
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
						console.log(docs.length);

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
						})
						data.sort(compare);
						$rootScope.$apply();
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
								data[index] = newDoc;
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
						break;
				}
			}

			fetchInitialDocs().then(reactToChanges).catch(console.log.bind(console));

			return {
				dbConnection: dbConnection,
				docs: data,
				settings: settings,
				syncDB: login,
				cancelSync: function () {
					sync.cancel()
				},
				put: function (doc) {
					return db.put(doc, function(err) {
							// console.log(err)
							if (err) {
								var errorMessage;
								switch (err.name) {
									case 'conflict':
										if (doc.type == 'reading') {
											errorMessage = String.format('An entry with same date and time <span class="no-wrap">({0})</span> already exists.',
												// new Date(parseInt(doc._id)).format()'M j, Y h:i A');
												moment(parseInt(doc._id)).format('MMM D, YYYY h:mm A'));
										} else{
											errorMessage = 'Entry already exists.';
										}
										break;
									default:
										errorMessage = 'Entry already exists.';
										break;
								}
								Scopes.store('flashMessage', {title: 'Error!', message: errorMessage, severity: 'danger', pause: true});
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
				delete: function (doc) {
					return db.get(doc._id)
						.then(function (doc) {
							return db.remove(doc)
								.then(util.resolve, util.reject);
						})
						.catch(util.reject);
				}
			};
		})

		.service('flashMessage', function(Flash){
			return {
				create: function(flash) {
					Flash.dismiss();
					Flash.create(flash.severity, '<strong>'+ flash.title + '</strong>&nbsp;&nbsp;' + flash.message, flash.class);
				},
				pause: function() {
					Flash.pause();
				}
			}
		})

		.service('dataService', function (Scopes, $cookies) {
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
					var summary = {};
					getSettings();

					summary.startDateTime = start._id,
					summary.endDateTime = end._id,
					summary.startReading = start.reading,
					summary.latestReading = end.reading,
					summary.electricityRate = electricityRate;
					summary.currentUsage = end.reading - start.reading;
					summary.elapsedTime = parseInt(end._id) - parseInt(start._id);
					summary.currentCost = summary.currentUsage * summary.electricityRate;

					var days = summary.elapsedTime / (3600000 * 24);

					summary.aveUsagePerDay = days >= 1 ? summary.currentUsage / days : summary.currentUsage;
					summary.aveCostPerDay = days >= 1 ? summary.currentCost / days : summary.currentCost;

					return summary;
				}
			}
		})

		.controller('MainController', function ($scope, $cookies, db, data, Scopes, flashMessage) {

			var flashDuration = 3500;
			// $scope.appName = ".";
			$scope.appName = "reading-trackr";
			$scope.title = $scope.appName + " App";
			$scope.flashDuration = flashDuration;
			$scope.serverPlaceholder = window.location.hostname;
			$scope.defaultElectricityRate = "Default: P 13.00"

			$scope.setTitle = function (pageTitle) {
				//console.log(pageTitle);
				//$scope.title = pageTitle ? pageTitle + " | " + $scope.appName : $scope.appName;
			}
			
			$scope.animateFrom = function() {
				return $cope.$state.current.name == 'home' ? 'from-right' : 'from-left';
			}
			
			var currentYear = new Date().getFullYear();
			var copyrightYears = currentYear != 2015 ? 2015 + " - " + currentYear : 2015;
			$scope.footerText = String.format("© {0} Electricity Reading Trackr App | uNkNowN92", copyrightYears);

			$scope.settings = data.settings;
			
			$scope.syncDB = function () {
				toggleDbSync();
			}

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

			$scope.$on('scope.stored', function (event, storedData) {
				$scope.$apply(function () {
					switch (storedData.key) {
						case 'dbStatus-' + $cookies.get('guid'):
							$scope.dbConnection = storedData.value.dbConnection;

							if(!$scope.dbConnection && $scope.settings.enableSync)
								toggleDbSync();

							break;
						case 'flashMessage-' + $cookies.get('guid'):
							flashMessage.create({
								severity: storedData.value.severity,
								title: storedData.value.title,
								message: storedData.value.message
							});
							if (storedData.value.pause)
								flashMessage.pause();
    			
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
				}, function (err) { console.log(err); })
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
					})
				}).catch(function (err) { console.log(err); });
			}

		})

		.controller('DataController', function ($scope, data, dataService, Scopes, $filter) {
			$scope.todos = data.docs;
			$scope.focusReading = [];
			$scope.focusDateTime = [];
			$scope.editedReading = [];
			$scope.editedDateTime = [];
			$scope.limit = 10;

			$scope.loadMore = function () {
				if ($scope.limit < $scope.todos.length)
					$scope.limit += 10;
			}

			$scope.beginEditing = function (id, element, index) {
				var index = getIndex($scope.todos, id);
				var doc = $scope.todos[index];
				$scope.index = index;
				$scope.focusReading[index] = element == 'reading';
				$scope.focusDateTime[index] = element == 'dateTime';
				$scope.editingId = id;
				$scope.editedReading[index] = parseFloat(doc.reading).toFixed(1);
				$scope.editedDateTime[index] = $filter('date')(doc._id, 'mediumDate') + " " + $filter('date')(doc._id, 'shortTime');

				$.datetimepicker.setLocale('en');
				$('#' + id).datetimepicker({ format: 'M j, Y h:i A', step: 15, value: new Date(parseInt(doc._id)) });
			};

			$scope.editReading = function (docId) {
				var index = $scope.index;
				var updatedDoc = {
					_id: new Date($scope.editedDateTime[index]).getTime().toString(),
					reading: parseFloat($scope.editedReading[index]),
				};
				updatedDoc._id = removeSeconds(updatedDoc._id);

				data.get(docId).then(function (doc) {
					if (updatedDoc._id != doc._id) {
						data.delete(doc).catch(function (reason) { console.log(reason); });
						var newDoc = {
							type: 'reading',
							startReading: $scope.startOfMonth || false
						};
						$.extend(newDoc, updatedDoc);
						data.put(newDoc).then(function (res) { $scope.$apply(); }, function (err) { console.log(err); })
					} else {
						$.extend(doc, updatedDoc);
						data.put(doc).then(function (res) { $scope.$apply(); }, function (err) { console.log(err); })
					}

				});

				$scope.editedReading[index] = null;
				$scope.editedDateTime[index] = null;
				delete $scope.editingId;
				closeDateTimePicker();
			}
			
			function closeDateTimePicker() {
				$('.xdsoft_datetimepicker').fadeOut();
			}
			
			$scope.closeDateTimePicker = function() {
				closeDateTimePicker();
			}

			$scope.addNewDoc = function () {

				// for (var i = 0; i < 50; i++) {
				// 	$scope.dateTime = Math.random() * 1447039080000;
				// console.log("new");				
				var newDoc = {
					type: 'reading',
					_id: removeSeconds($scope.dateTime || new Date().getTime().toString()),
					reading: parseFloat($scope.newReading).toFixed(1),
					startReading: $scope.startOfMonth || false,
				};

				data.put(newDoc).then(function (res) {
					console.log(res);
					$scope.$apply(function () {
						$scope.newReading = '';
						// console.log("added");
					})
				}, function (err) {
					console.log(err);
				})

			};
			// };


			$scope.deleteDoc = function (doc) {
				data.delete(doc)
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
		})

		.controller('SummaryController', function ($scope, data, Scopes, dataService, $filter) {
			$scope.docs = data.docs;
			$scope.limit = 10;

			$scope.resetLimit = function() {
				$scope.limit = 10;
			}

			$scope.loadMore = function (override) {
				if ($scope.limit < $scope.docs.length && $scope.windowWidth > 800 || override)
					$scope.limit += 10;
			}

			$scope.getSummary = function () {
				
				
				var end, start, summary;
				
				if ($scope.dateFrom || $scope.dateTo) {
					if ($.isEmptyObject($scope.results)) return;
	
					end = $scope.results[$scope.results.length - 1];
					start = $scope.results[0];
					summary = dataService.getSummary(start, end);
				} else {
					if ($.isEmptyObject($scope.docs)) return;
					
					start = $scope.docs[$scope.docs.length - 1];
					end = $scope.docs[0];
					summary = dataService.getSummary(start, end);
				}

				$.extend($scope, summary);
				$scope.docs = dataService.calculate($scope.docs);
			}

			$scope.windowWidth = window.innerWidth;
			$(window).resize(function () {
				$scope.$apply(function () {
					$scope.windowWidth = window.innerWidth;
				});
			});
		})
		
		.directive('datetimePicker', function($timeout) {
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
			}
		})

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

		.directive('notification', function ($timeout) {
			return {
				restrict: 'E',
				template:"<div class='alert alert-{{alertData.type}}' ng-show='alertData.message' role='alert' data-notification='{{alertData.status}}'>{{alertData.message}}</div>",
				scope:{
					alertData:"="
				}
			};
		})

		.directive('validateFloat', function () {

			var FLOAT_REGEXP = /^\-?\d+((\.|\,)\d{0,1})?$/;

			return {
				require: "ngModel",
				link: function (scope, elm, attrs, ngModelController) {

					ngModelController.$parsers.unshift(function (viewValue) {
						if (viewValue == '') {
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

		.directive('autoFocus', function ($timeout) {
			return {
				restrict: 'AC',
				link: function (_scope, _element) {
					$timeout(function () {
						_element[0].focus();
					}, 0);
				}
			};
		})

		.directive('focus', function ($timeout) {
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
		})
		
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
	}

	// function extractData(arr, filter) {
	// 	return _.map(_.where(arr, filter));
	// }

	function compare(a, b) {
		return b._id - a._id;
	}

	function getIndex(data, docId) {
		var indexes = $.map(data, function (obj, index) {
			if (obj._id == docId) {
				return index;
			}
		});
		return indexes[0];
	}


})();