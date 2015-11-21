var http = require("http");
var express = require('express');
var path = require('path');

var app = express();
app.use(express.static(__dirname + "/public"));

app.get('/', function(req, res){
    res.sendFile(path.join(__dirname + '/index.html'));
});

app.get('/pouch-todo', function(req, res){
    res.sendFile(path.join(__dirname + '/public/pouch-todo/index.html'));
});

var server = app.listen(80, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});
// http.createServer(function (request, response) {

//    // Send the HTTP header 
//    // HTTP Status: 200 : OK
//    // Content Type: text/plain
//    response.writeHead(200, {'Content-Type': 'text/plain'});
   
//    // Send the response body as "Hello World"
//    response.end('Hello World\n');
// }).listen(8081);

// // Console will print the message
// console.log('Server running at http://127.0.0.1:8081/');