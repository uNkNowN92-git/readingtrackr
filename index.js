var server_port       = process.env.OPENSHIFT_NODEJS_PORT || 8080
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP   || '10.230.57.17'
 
var http    = require("http");
var express = require('express');
var path    = require('path');

var app = express();
app.use(express.static(__dirname + "/public"));

app.get('/', function(req, res){
    res.sendFile(path.join(__dirname + '/index.html'));
});

var server = app.listen(server_port, server_ip_address, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Listening on http://%s:%s', host, port);
});
