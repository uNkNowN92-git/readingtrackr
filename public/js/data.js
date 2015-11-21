
(function () {

  // 'use strict';

  // var ENTER_KEY = 13;
  // var newTodoDom = document.getElementById('new-todo');
  // var syncDom = document.getElementById('sync-wrapper');

  // // EDITING STARTS HERE (you dont need to edit anything above this line)

  // var dbName = 'todos';
  // var settingsLocation = '_local/settings';

  var db = new PouchDB(dbName);
  // var remoteCouchTemplate = 'http://{0}:{1}@{2}:5984/' + dbName;
  // var remoteCouch = false;
  // var sync;
  // var enableDelete = true;

  // $.datetimepicker.setLocale('en');
  //loadSettings();

  // $('#settings-form').validate(
  // //   {
  // //   submitHandler: function () {
  // //     updateSettings();
  // //   }
  // // }
  // );

  $("#new-todo").validate({
    rules: {
      field: {
        required: true,
        number: true
      }
    }
  });

  $('a[rel*=leanModal]').leanModal({ top: 100, closeButton: ".modal_close" });

  // $('#settings-form').submit(function (e) {
  //   e.preventDefault();
  function updateSettings() {

    var settings = new Object();
    settings.server = $('#server').val();
    settings.username = $('#username').val();
    settings.password = $('#password').val();

    console.log(settings);

    db.get(settingsLocation).then(function (doc) {

      doc.value = JSON.stringify(settings);
      console.log("updating with: ", doc.value);
      return db.put(doc);
    }).catch(function (err) {
      console.log("updateSettings catch:", err);
      if (err.status == 404) {
        // settings.server = $('#server').val();
        // settings.username = $('#username').val();
        // settings.password = $('#password').val();

        db.put({
          _id: settingsLocation,
          value: JSON.stringify(settings)
        });
      }
    });

    $('#result').hide().html("Saved").fadeIn(1000, function () {
      loadSettings();
    });

  }

  $('#reset-settings').click(function (e) {
    e.preventDefault();
    if (!confirm("Are you sure you want to reset the settings?")) return;

    $('#settings-form')[0].reset();
    db.get(settingsLocation).then(function (doc) {
      var settings = $.parseJSON(doc.value);
      delete settings.server;
      delete settings.username;
      delete settings.password;

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

  //     $('#server').val(settings.server ? settings.server : window.location.hostname);
  //     $('#dbname').val(settings.dbname);
  //     $('#username').val(settings.username);
  //     $('#password').val(settings.password);

  //     remoteCouch = String.format(remoteCouchTemplate, settings.username, settings.password, settings.server);
  //     // console.log(remoteCouch);
  //     if (settings.server != "" && settings.username != "" && settings.password != "")
  //       syncDB();
  //   }).catch(function (err) {
  //     $('#server').attr("placeholder", window.location.hostname);
  //     console.log("loadSettings catch:", err);
  //   });
  // }

  // String.format = function () {
  //   var s = arguments[0];
  //   for (var i = 0; i < arguments.length - 1; i++) {
  //     var reg = new RegExp("\\{" + i + "\\}", "gm");
  //     s = s.replace(reg, arguments[i + 1]);
  //   }
  //   return s;
  // }

  db.changes({
    since: 'now',
    live: true
  }).on('change', showEntries);

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
    db.allDocs({ include_docs: true, descending: true }, function (err, doc) {
      redrawTodosUI(doc.rows);
    });
  }

  function checkboxChanged(todo, event) {
    todo.startOfMonth = event.target.checked;
    db.put(todo);
  }

  // User pressed the delete button for a todo, delete it
  function deleteButtonPressed(todo) {
    if(confirm("Are you sure you want to delete the entry?"))
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
  
  // Initialise a sync with the remote server
  // function syncDB() {
  //   if (sync != undefined) sync.cancel();

  //   syncDom.setAttribute('data-sync-state', 'syncing');

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

  function syncComplete() {
    // syncDom.setAttribute('data-sync-state', 'complete');
  }

  // EDITING ENDS HERE (you dont need to edit anything below this line)

  // There was some form or error syncing
  function syncError() {
    syncDom.setAttribute('data-sync-state', 'error');
    sync.cancel();
    log('error syncing...');
  }

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

  // Given an object representing a todo, this will create a list item
  // to display it.
  function createTodoListItem(todo) {
    // console.log("create:", todo);
    
    var checkbox = document.createElement('input');
    checkbox.className = 'toggle';
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', checkboxChanged.bind(this, todo));

    //var date = new Date(parseInt(todo._id);
    var labelReading = document.createElement('label');
    //var text = todo.title + " - " + moment(parseInt(todo._id)).format('l h:mA');
    //console.log(text);
    labelReading.className = 'reading';
    labelReading.appendChild(document.createTextNode(todo.reading));
    //labelReading.addEventListener('dblclick', readingDblClicked.bind(this, todo));
    var mcReading = new Hammer.Manager(labelReading);
    mcReading.add(new Hammer.Tap({ event: 'doubletap', taps: 2 }));
    mcReading.on("doubletap", readingDblClicked.bind(this, todo));


    //var date = new Date(parseInt(todo._id);
    var labelDateTime = document.createElement('label');
    var textDateTime = convertDateTimetoString(todo._id);
    //console.log("Date/Time:",textDateTime);
    labelDateTime.className = 'datetime';
    labelDateTime.appendChild(document.createTextNode(textDateTime));
    //labelDateTime.addEventListener('dblclick', dateTimeDblClicked.bind(this, todo));
    var mcDateTime = new Hammer.Manager(labelDateTime);
    mcDateTime.add(new Hammer.Tap({ event: 'doubletap', taps: 2 }));
    mcDateTime.on("doubletap", dateTimeDblClicked.bind(this, todo));

    if (enableDelete) {
      var deleteLink = document.createElement('button');
      deleteLink.className = 'destroy';
      deleteLink.addEventListener('click', deleteButtonPressed.bind(this, todo));
    }

    var divDisplay = document.createElement('div');
    divDisplay.className = 'view';
    divDisplay.appendChild(checkbox);
    divDisplay.appendChild(labelReading);
    divDisplay.appendChild(labelDateTime);
    if (enableDelete)
      divDisplay.appendChild(deleteLink);

    var inputEditReading = document.createElement('input');
    inputEditReading.id = 'input_reading_' + todo._id;
    inputEditReading.className = 'edit reading';
    inputEditReading.value = todo.reading;
    inputEditReading.addEventListener('keypress', todoKeyPressed.bind(this, todo));
    // inputEditReading.addEventListener('blur', readingBlurred.bind(this, todo));
    
    var inputEditDateTime = document.createElement('input');
    inputEditDateTime.id = 'input_id_' + todo._id;
    inputEditDateTime.className = 'edit datetime';
    inputEditDateTime.value = textDateTime;
    inputEditDateTime.addEventListener('keypress', dateTimeKeyPressed.bind(this, todo));
    // inputEditDateTime.addEventListener('blur', dateTimeBlurred.bind(this, todo));

    var li = document.createElement('li');
    li.id = 'li_' + todo._id;
    li.appendChild(divDisplay);
    li.appendChild(inputEditReading);
    li.appendChild(inputEditDateTime);

    if (todo.startOfMonth) {
      li.className += 'complete';
      checkbox.checked = true;
    }

    return li;
  }

  function redrawTodosUI(todos) {
    var ul = document.getElementById('todo-list');
    ul.innerHTML = '';
    $('.entry-count').html(todos.length + (todos.length == 1 ? " entry" : " entries"));
    todos.forEach(function (todo) {
      ul.appendChild(createTodoListItem(todo.doc));
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

  addEventListeners();
  showEntries();

})();
