(function() {
	
	'use strict';

	var app = angular.module('electricityUsageApp', ['ngRoute', 'pouchdb'])

	.config(['$routeProvider',
		function ($routeProvider) {
			$routeProvider
			.when('/summary', {
				templateUrl: 'partials/summary.html',
				controller: 'SummaryController',
				controllerAs: 'summary'
			})
			.when('/', {
				templateUrl: 'partials/data.html',
				controller: 'DataController',
				controllerAs: 'data'
			})
			;
		}])

	.run(function ($rootScope) {
		$rootScope.$on('scope.stored', function (event, data) {
			console.log("scope.stored", data);
		});
	})

	.factory('Scopes', function ($rootScope) {
		var mem = {};

		return {
			store: function (key, value) {
				$rootScope.$emit('scope.stored', value);
				mem[key] = value;
			},
			get: function (key) {
				return mem[key];
			}
		};
	})

	.filter('humanizeDuration', function () {
		return function (duration) {
			duration = parseInt(duration / 1000) * 1000;
			return duration ? humanizeDuration(duration, { largest: 2, delimiter: " and " }) : null;
		}
	})

	.service('db', function (pouchDB) {
		var user = "test1";
		return new pouchDB(user + '_todos');
	})

	.service('data', function($rootScope, $q, db){

		return {
			addReading: function(doc) {
				var deferred = $q.defer();
				var newDoc = {
					type: 'reading',
					_id: doc.dateTime || new Date().getTime().toString(),
					reading: doc.reading,
					startOfMonth: doc.startOfMonth || false
				};

				db.post(newDoc, function (err, res) {
					$rootScope.$apply(function() {
						if (err) {
							deferred.reject(err)
						} else {
							deferred.resolve(res)
						}
					});
				});
				return deferred.promise;
			},

			deleteReading: function(id) {
				var deferred = $q.defer();
				db.get(id, function(err, doc) {
					$rootScope.$apply(function() {
						if (err) {
							deferred.reject(err);
						} else {
							db.remove(doc, function(err, res) {
								$rootScope.$apply(function() {
									if (err) {
										deferred.reject(err)
									} else {
										deferred.resolve(res)
									}
								});
							});
						}
					});
				});
				return deferred.promise;
			}
		}
	})

.factory('listener', function($rootScope, db) {
	return db.changes({
		continuous: true,
		onChange: function(change) {
			console.log('changed');
			if (!change.deleted) {
				$rootScope.$apply(function() {
					db.get(change.id, function(err, doc) {
						$rootScope.$apply(function() {
							if (err) console.log(err);
							console.log('newReading');
							$rootScope.$broadcast('newReading', doc);
						})
					});
				})
			} else {
				$rootScope.$apply(function() {
					$rootScope.$broadcast('deleteReading', change.id);
				});
			}
		}
	});
})

.service('dataService', function (Scopes) {
		var electricityRate = Scopes.get('electricityRate') || 13; // TEMP
		
		return {
			calculate: function(docs) {
				angular.forEach(docs, function (doc, key) {
					var previousDoc = docs[key - 1];
					if (!previousDoc) {
						delete doc.elapsedTime;
						delete doc.usage;
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
			getSummary: function(start, end) {
				var summary = {}
				
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

.controller('MainController', function ($scope, db, dataService, listener, Scopes) {

	$scope.todos = [];
	$scope.test = "test";
	$scope.appName = "";
	$scope.pageTitle = $scope.appName;

	$scope.setTitle = function (pageTitle) {
		$scope.pageTitle = pageTitle ? pageTitle + " | " + $scope.pageTitle : $scope.appName;
	}

})

.controller('DataController', function ($scope, data, dataService, Scopes) {
	$scope.todos = [];

	// function fetchInitialDocs() {
	// 	console.log("fetchInitialDocs");
	// 	return db.allDocs({ include_docs: true }).then(function (response) {
	// 		$scope.todos = response.rows.map(function (row) { return row.doc; });
	// 	}).then(storeDocs);
	// }

	// function reactToChanges() {
	// 	db.changes({ live: true, since: 'now', include_docs: true })
	// 	.on('change', function (change) {
	// 		$scope.$apply(function () {
	// 			if (change.deleted) {
	// 				onDeleted(change.id);
	// 			} else {
	// 				onUpdatedOrInserted(change.doc);
	// 			}
	// 			storeDocs();
	// 		})
	// 	}).on('error', console.log.bind(console));
	// }

	// fetchInitialDocs().then(reactToChanges).catch(console.log.bind(console));

	// function onDeleted(id) {
	// 	var index = binarySearch($scope.todos, id);
	// 	var doc = $scope.todos[index];
	// 	if (doc && doc._id === id) {
	// 		$scope.todos.splice(index, 1);
	// 	}
	// }

	// function onUpdatedOrInserted(newDoc) {
	// 	var index = binarySearch($scope.todos, newDoc._id);
	// 	var doc = $scope.todos[index];
	// 	if (doc && doc._id === newDoc._id) {
	// 		$scope.todos[index] = newDoc;
	// 	} else {
	// 		$scope.todos.push(newDoc);
	// 	}
	// }

	// function storeDocs () {
	// 	Scopes.store('docs', $scope.todos);
	// 	Scopes.store('changed', true);
	// }

	$scope.addNewDoc = function () {
		var newDoc = {
			_id: $scope.dateTime,
			reading: $scope.newReading,
			startReading: $scope.startOfMonth
		};

		data.addReading(newDoc).then(function(res) {
			$scope.newReading = '';
			console.log(res);
		}, function(err) {
			console.log(err);
		})
		// db.post(newTodo, function (err, res) {
		// 	if (err) { console.log(err); }
		// 	newTodo._id = res.id;
		// 	newTodo._rev = res.rev;
		// });
};

$scope.removeDone = function () {
	angular.forEach($scope.todos, function (todo) {
		if (todo.done) {
			// db.get(todo._id).then(function (doc) {
			// 	db.remove(doc);
			// });
}
});
};

$scope.deleteDoc = function (doc) {
		// db.get(doc._id).then(function (res) {
		// 	db.remove(res);
		// });
};

$scope.updateTodo = function (todo) {
	// db.get(todo._id).then(function (doc) {
	// 	db.put(todo);
	// });
};

$scope.$on('newReading', function(event, doc) {
	console.log(doc);
	$scope.todos.push(doc);
});

$scope.$on('delTodo', function(event, id) {
	for (var i = 0; i<$scope.todos.length; i++) {
		if ($scope.todos[i]._id === id) {
			$scope.todos.splice(i,1);
		}
	}
});
})

.controller('SummaryController', function ($scope, data, Scopes, dataService) {
	// $scope.appName = "electricity-usage";

	$scope.allDocs = function () {
		//data.allDocs();
		// $scope.docs = Scopes.get('docs');
		// if ($.isEmptyObject($scope.docs)) {
		// 	console.log("fetch");
		// 	//fetchInitialDocs().then(reactToChanges).then(calculateValues).catch(console.log.bind(console));
		// } else {
		// 	calculateValues();
		// }
	};

	function calculateValues() {
		if (!$.isEmptyObject($scope.docs)) {
			$scope.docs = dataService.calculate($scope.docs);
			Scopes.store('docs', $scope.docs);
		}
		getSummary();
	}

	function getSummary() {
		if ($.isEmptyObject($scope.docs)) return;

		var start = $scope.docs[0];
		var end = $scope.docs[$scope.docs.length - 1];
		var summary = dataService.getSummary(start, end);

		jQuery.extend($scope, summary);			
	}

})

.directive('styles', function () {
	return {
		restrict: 'E',
		templateUrl: 'partials/navbar.html'
	};
})

.directive('navbar', function () {
	return {
		restrict: 'E',
		templateUrl: 'partials/navbar.html',
		controller: 'MainController',
		controllerAs: 'main'
	};
})

.directive('modal', function () {
	return {
		restrict: 'E',
		templateUrl: 'partials/modal.html',
		controller: 'MainController'
	};
})

.directive('autoFocus', function($timeout) {
	return {
		restrict: 'AC',
		link: function(_scope, _element) {
			$timeout(function(){
				_element[0].focus();
			}, 0);
		}
	};
})

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

function binarySearch(arr, docId) {
	var low = 0, high = arr.length, mid;
	while (low < high) {
		mid = (low + high) >>> 1;
		arr[mid]._id < docId ? low = mid + 1 : high = mid
	}
	return low;
}


})();