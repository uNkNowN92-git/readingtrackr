(function(){
	var app = angular.module('appServices', ['infinite-scroll', 'hmTouchEvents', 'flash', 'ngAnimate', 'ngCookies', 'ngMessages'])
	
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

				var remoteDB = new PouchDB(remoteCouch, pouchOpts);

				remoteDB.login(user.name, user.password, ajaxOpts, function (err, response) {
					console.log('login');
					
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
						// if (settings.enableSync)
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

				console.log("sync", remoteCouch);

				$rootScope.$apply(function () {
					sync = db.sync(remoteCouch, {
						live: true,
						filter: function (doc) {
							// console.log(doc);
							return doc.type === 'reading' || doc._deleted;
						}
					}).on('paused', function () {
						dbConnection = true;
						Scopes.store('dbStatus', {
							// enableSync: false,
							dbConnection: dbConnection
						});
						console.log('paused');
					}).on('active', function () {
						console.log('active')
						dbConnection = true;
					}).on('denied', function (info) {
						console.log('denied', info)
						dbConnection = false;
					}).on('complete', function (info) {
						console.log(info);
						// enableSync = true;
						dbConnection = true;
						Scopes.store('dbStatus', {
							// enableSync: enableSync,
							dbConnection: dbConnection
						});
					}).on('error', function (err) {
						dbConnection = false;
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
					return db.put(doc)
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
		
		.directive('navbar', function () {
			return {
				restrict: 'E',
				templateUrl: 'partials/navbar.html',
				controller: 'MainController',
				controllerAs: 'main'
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
})()