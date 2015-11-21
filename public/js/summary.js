(function () {

  // var db = new PouchDB(dbName);
  
  loadSettings();

  $('#settings-form').validate({
    submitHandler: function () {
      updateSettings();
    }
  });

  // $('a[rel*=leanModal]').leanModal({ top: 100, closeButton: ".modal_close" });

  // $('#settings-form').submit(function (e) {
  //   e.preventDefault();
  function updateSettings() {

    // var settings = new Object();
    // settings.electricityRate = $('#electricity-rate').val();

    // console.log(settings);

    // db.get(settingsLocation).then(function (doc) {
    //   var value = JSON.parse(doc.value);
    //   value.electricityRate = settings.electricityRate;
    //   console.log(value);
    //   doc.value = JSON.stringify(value);
    //   console.log("updating with: ", doc.value);
    //   return db.put(doc);
    // }).catch(function (err) {
    //   console.log("updateSettings catch:", err);
    //   if (err.status == 404) {

    //     db.put({
    //       _id: settingsLocation,
    //       value: JSON.stringify(settings)
    //     });
    //   }
    // });

    // $('#result').hide().html("Saved").fadeIn(1000, function () {
    //   loadSettings();
    // });

  }

  $('#reset-settings').click(function (e) {
    e.preventDefault();
    if (!confirm("Are you sure you want to reset the settings?")) return;

    $('#settings-form')[0].reset();
    db.get(settingsLocation).then(function (doc) {
      var settings = $.parseJSON(doc.value);
      delete settings.electricityRate;
      
      return db.put({
        _id: settingsLocation,
        _rev: doc._rev,
        value: JSON.stringify(settings)
      });
    }).catch(function (err) {
      console.log(err);
    });

    $('#result').hide().html("Cleared").fadeIn();
  });

  // function loadSettings() {
  //   console.log("loading settings...");
  //   db.get(settingsLocation).then(function (doc) {
  //     var settings = $.parseJSON(doc.value);
  //     settings.rev = doc._rev;
  //     console.log("settings:", settings);

  //     $('#server').val(settings.server);
  //     $('#username').val(settings.username);
  //     $('#password').val(settings.password);
  //     $('#electricity-rate').val(settings.electricityRate);
  //     electricityRate = settings.electricityRate ? settings.electricityRate : 13;

  //     remoteCouch = String.format(remoteCouchTemplate, settings.username, settings.password, settings.server);
  //     console.log(remoteCouch);
  //     if (settings.server != "" && settings.username != "" && settings.password != "")
  //       syncDB();
        
  //     showEntries();
  //   }).catch(function (err) {
  //     console.log("loadSettings catch:", err);
  //   });
  // }

  String.format = function () {
    var s = arguments[0];
    for (var i = 0; i < arguments.length - 1; i++) {
      var reg = new RegExp("\\{" + i + "\\}", "gm");
      s = s.replace(reg, arguments[i + 1]);
    }
    return s;
  }

  // db.changes({
  //   since: 'now',
  //   live: true
  // }).on('change', showEntries);

  function convertDateTimetoString(datetime) {
    return moment(parseInt(datetime)).format('DD-MMM-YY h:mm A');
  }

  function getDateTimeValue(datetime, convert) {
    convert = convert != undefined ? convert : true;

    if (convert)
      datetime = convertDateTimetoString(datetime);

    return new Date(datetime).getTime().toString();
  }
  
  // We have to create a new todo document and enter it in the database
  function addEntry(reading, dateTime, startOfMonth) {
    dateTime = dateTime != undefined ? dateTime : new Date().getTime();
    startOfMonth = startOfMonth != undefined ? startOfMonth : false;
    reading = parseFloat(reading).toFixed(1);
    dateTime = getDateTimeValue(dateTime);

    if (isNaN(reading)) {
      console.log('Invalid entry');
    } else {
      var todo = {
        _id: dateTime,
        reading: reading,
        startOfMonth: startOfMonth
      };
      console.log("new entry:", todo);
      db.put(todo, function callback(err, result) {
        console.log("adding:", err, result);
        if (!err) {
          console.log('Successfully posted an entry!');
        }
      });
    }
  }

  // Show the current list of todos by reading them from the database
  function showEntries() {
    db.allDocs({ include_docs: true, descending: false }, function (err, doc) {
      redrawTodosUI(doc.rows);
    });
  }

  function checkboxChanged(todo, event) {
    todo.startOfMonth = event.target.checked;
    db.put(todo);
  }

  // User pressed the delete button for a todo, delete it
  function deleteButtonPressed(todo) {
    db.remove(todo);
  }

  // The input box when editing a todo has blurred, we should save
  // the new title or delete the todo if the title is empty
  function readingBlurred(todo, event) {
    var trimmedText = event.target.value.trim();
    if (!trimmedText) {
      db.remove(todo);
    } else {
      todo.reading = parseFloat(trimmedText).toFixed(1);
      db.put(todo);
    }
  }

  function dateTimeBlurred(todo, event) {
    var trimmedText = event.target.value.trim();
    if (!trimmedText) {
      db.remove(todo);
    } else {
      db.remove(todo);
      todo._id = getDateTimeValue(trimmedText, false);
      db.put(todo);
    }
  }

  function updateReading(todo, value) {
    // console.log("reading:", value);
    if (!value) {
      db.remove(todo);
    } else {
      todo.reading = parseFloat(value).toFixed(1);
      db.put(todo);
    }
  }

  function dateTimeIsEqual(value1, value2) {
    // console.log("before:", value1, value2);
    value1 = new Date(value1).getTime();
    value2 = new Date(parseInt(value2)).getTime();
    // console.log("after:", value1, value2);
    return value1 == value2;
  }

  function updateDateTime(todo, value) {
    // console.log("datetime:", value);
    if (!value) {
      db.remove(todo);
    } else {
      if (!dateTimeIsEqual(value, parseInt(todo._id))) {
        // console.log("edited", todo);
           
        db.remove(todo, function (err, response) {
          // console.log(err, response);
          if (response.ok == true) {
            todo._id = getDateTimeValue(value, false);
            delete todo._rev;
            db.put(todo);
          }
        });
      } else {
        var div = document.getElementById('li_' + todo._id);
        div.className = '';
      }
    }
  }

  function log(msg) {
    //$('#logs').append(msg + '<br>');
  }
  
  // // Initialise a sync with the remote server
  // function syncDB() {
  //   console.log("sync db");
  //   if (sync != undefined) sync.cancel();

  //   //syncDom.setAttribute('data-sync-state', 'syncing');

  //   log('syncing to ' + remoteCouch + '...');

  //   sync = db.sync(remoteCouch, {
  //     live: true,
  //     // retry: true
  //   }).on('change', function (info) {
  //     // handle change
  //   }).on('paused', function () {
  //     // replication paused (e.g. user went offline)
  //   }).on('active', function () {
  //     // replicate resumed (e.g. user went back online)
  //   }).on('denied', function (info) {
  //     // a document failed to replicate, e.g. due to permissions
  //     syncError();
  //   }).on('complete', function (info) {
  //     syncComplete();
  //   }).on('error', function (err) {
  //     syncError();
  //   });
  // }

  // function syncComplete() {
  //   //syncDom.setAttribute('data-sync-state', 'complete');
  // }

  // // EDITING ENDS HERE (you dont need to edit anything below this line)

  // // There was some form or error syncing
  // function syncError() {
  //   //syncDom.setAttribute('data-sync-state', 'error');
  //   sync.cancel();
  //   log('error syncing...');
  // }

  // User has double clicked a todo, display an input so they can edit the title
  function readingDblClicked(todo) {
    $('#todo-list li').removeClass('editing');
    var div = document.getElementById('li_' + todo._id);
    var inputEditReading = document.getElementById('input_reading_' + todo._id);
    div.className = 'editing';
    inputEditReading.focus();
  }

  function dateTimeDblClicked(todo) {
    $('#todo-list li').removeClass('editing');
    var div = document.getElementById('li_' + todo._id);
    var inputEditDateTime = document.getElementById('input_id_' + todo._id);
    div.className = 'editing';
    inputEditDateTime.focus();
    $('#input_id_' + todo._id).datetimepicker({ format: 'd-M-y h:i A', step: 15, value: new Date(parseInt(todo._id)) });
  }

  // If they press enter while editing an entry, blur it to trigger save
  // (or delete)
  function todoKeyPressed(todo, event) {
    // console.log(event.keyCode); 
    if (event.keyCode === ENTER_KEY) {
      // var inputEditReading = document.getElementById('input_reading_' + todo._id);
      // inputEditReading.blur();
      $('[class*=xdsoft_]').trigger('close.xdsoft');
      updateReading(todo, event.target.value.trim());
      // $('.xdsoft_').hide();      
    }
  }

  function dateTimeKeyPressed(todo, event) {
    // console.log(event, event.keyCode);
    if (event.keyCode === ENTER_KEY) {
      //var inputEditDateTime = document.getElementById('input_id_' + todo._id);
      //inputEditDateTime.blur();
      var value = event.target.value.trim();
      //console.log("enter:", value, new Date(value));
      $('[class*=xdsoft_]').trigger('close.xdsoft');
      updateDateTime(todo, new Date(value));
    }
  }

  Number.prototype.format = function (n, x) {
    var re = '\\d(?=(\\d{' + (x || 3) + '})+' + (n > 0 ? '\\.' : '$') + ')';
    return this.toFixed(Math.max(0, ~~n)).replace(new RegExp(re, 'g'), '$&,');
  };

  var electricityRate = 13;
  var previousTodo = {};
  function createTodoListItemRow(todo) {
    var columns = {};

    columns.reading = todo.reading;
    columns.dateTime = convertDateTimetoString(todo._id);
    columns.usage = "-";
    columns.duration = "-";
    columns.cost = "-";
    columns.aveUsagePerHour = "-";
    columns.aveCostPerHour = "-";

    if (!$.isEmptyObject(previousTodo)) {
      var usage = todo.reading - previousTodo.reading;
      var cost = usage * electricityRate;
      var startTime = moment(parseInt(previousTodo._id));
      var endTime = moment(parseInt(todo._id));
      var duration = endTime.diff(startTime);
      var aveUsagePerHour = usage / (duration / 3600000);
      var aveCostPerHour = cost / (duration / 3600000);

      if (usage > 0) {
        columns.usage = usage.toFixed(1);
        columns.duration = moment.utc(duration).format("H[h] m[m]");
        columns.cost = cost.toFixed(2);
        columns.aveUsagePerHour = aveUsagePerHour.toFixed(2);
        columns.aveCostPerHour = aveCostPerHour.toFixed(2);
      }
      else if (usage < 0) {
        columns.usage = "invalid";
      }
    }

    previousTodo = todo;

    var tr = $('<tr/>');
    $.each(columns, function (key, value) {
      tr.append('<td class="' + key + '">' + value + '</td>');
    });

    return tr;
  }

  function redrawTodosUI(todos) {
    if (todos[0] == undefined) return;
      
    var summaryDetails = $('#summary-details');
    var tableBody = $('#table-summary tbody');

    var start = todos[0].doc;
    var end = todos[todos.length - 1].doc;
    var startTime = moment(parseInt(start._id));
    var endTime = moment(parseInt(end._id));
    var duration = endTime.diff(startTime);
    var totalUsage = end.reading - start.reading;
    var totalCost = totalUsage * electricityRate;
    var aveUsagePerDay = totalUsage / (duration / (3600000 * 24));
    var aveCostPerDay = totalCost / (duration / (3600000 * 24));
    var estMonthlyUsage = aveUsagePerDay * 30;
    var estMonthlyFee = aveCostPerDay * 30;

    var summary = {
      "Start Reading": start.reading,
      "Latest Reading": end.reading,
      "Elapsed Time": duration ? moment.utc(duration).format("D [days]") : "-",
      "Current Usage": totalUsage ? totalUsage.toFixed(1) + " kWh" : "-",
      "Electricity Rate": "P " + Number(electricityRate).format(2),
      "Current Cost": totalCost ? "P " + Number(totalCost).format(2) : "-",
      "Ave Usage per day": aveUsagePerDay ? aveUsagePerDay.toFixed(1) + " kWh" : "-",
      "Ave Cost per day": aveCostPerDay ? "P " + Number(aveCostPerDay).format(2) : "-",
      "Est. Monthly Usage": estMonthlyUsage ? estMonthlyUsage.toFixed(1) + " kWh" : "-",
      "Est. Monthly Cost": estMonthlyFee ? "P " + Number(estMonthlyFee).format(2) : "-",
    };

    var dataList = $('<dl/>');
    dataList.addClass('summary');
    $.each(summary, function (key, value) {
      //console.log(key, value);
      $('<dt>' + key + '</dt><dd>' + value + '</dd>').appendTo(dataList);
    });

    //console.log("dl", dataList);

    summaryDetails.html(dataList);

    // console.log(start.reading, end.reading, totalUsage.toFixed(1));
    // console.log("duration:", duration, moment.utc(duration).format("D [days]"));
    // console.log("cost:", totalCost.toFixed(2));
    // console.log("ave usage per day:", aveUsagePerDay.toFixed(1));
    // console.log("ave cost per day:", aveCostPerDay.toFixed(2));
    // console.log("est monthly usage:", estMonthlyUsage.toFixed(1));
    // console.log("est monthly fee:", estMonthlyFee.toFixed(2));

    previousTodo = {};
    tableBody.html('');
    todos.forEach(function (todo) {
      tableBody.append(createTodoListItemRow(todo.doc));
    });
  }

  function newTodoKeyPressHandler(event) {
    if (event.keyCode === ENTER_KEY) {
      addEntry(newTodoDom.value);
      newTodoDom.value = '';
    }
  }

  function addEventListeners() {
    newTodoDom.addEventListener('keypress', newTodoKeyPressHandler, false);
  }

  //addEventListeners();
  showEntries();

})();
