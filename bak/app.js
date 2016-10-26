var path = require('path');
var fs = require('fs');
var express = require('express');
//var favicon = require('serve-favicon');
var http = require('http');
var https = require('https');
var forceSSL = require('express-force-ssl');
var app = express();
var proxy = require('http-proxy-middleware');
//https://github.com/expressjs/morgan
var morgan = require('morgan');

var config = require('./config');
var privateKey, certificate;
var exec = require('child_process').exec;

// Default Ports
var PORTS = {
  HTTP: config.web.http.port || 80,
  HTTPS: config.web.https.port || 443,
  FORCE_SSL_PORT: ''
}

// create a write stream (in append mode)
var accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), {flags: 'a'})

// setup the logger
app.use(morgan('combined', {stream: accessLogStream}))


PORTS.FORCE_SSL_PORT = config.web.https.forceSSLPort || PORTS.HTTPS;

// #2 SSL Support. All triggerd by the presence of config.web.https
if (config.web.https.enabled){
  console.log('Enabling HTTPS');
  privateKey = fs.readFileSync(path.resolve(config.web.https.keyPath));
  certificate = fs.readFileSync(path.resolve(config.web.https.certPath));

  if (config.web.https.forceHttps) {
    app.set('forceSSLOptions', {
      enable301Redirects: true,
      trustXFPHeader: false,
      httpsPort: PORTS.FORCE_SSL_PORT,
      sslRequiredMessage: 'SSL Required.'
    });
    app.use(forceSSL);
  }// config.web.https.forceHttps

}// config.web.https

//Uncomment if you don't want to redirect / and /apex to the new /ords
if (config.ords.redirectPaths.length > 0){
  for(i=0; i< config.ords.redirectPaths.length; i++){
    app.use(config.ords.redirectPaths[i],function(req, res, next){
      res.redirect(config.ords.path);
    });
  }
}

//Can store custom images in public/...
app.use(config.static.path, express.static(config.static.directory));
app.use(config.apex.images.path,express.static(config.apex.images.directory));

//Register favicon if applicable
// if (config.faviconUrl){
//   console.log('Favicon')
//   app.use(favicon(__dirname + config.faviconUrl));
// }

// https://github.com/chimurai/http-proxy-middleware
app.use(config.ords.path,proxy(
  {
    target: config.ords.webContainerUrl,
    changeOrigin: false,
    // Additional work seems to be required for unsigned certificats
    onProxyReq: function(proxyReq, req, res) {
      // For encrypted calls, if we don't set the origin on POST request then we'll get the following error
      // The request cannot be processed because this resource does not support Cross Origin Sharing requests, or the request Origin is not authorized to access this resource. If ords is being reverse proxied ensure the front end server is propagating the host name, for mod_proxy ensure ProxyPreserveHost is set to On
      if (req.connection.encrypted && req.headers.origin){
        proxyReq.setHeader('origin', req.headers.origin.replace(/^https:/,'http:'));
      }
    }, //onProxyReq
    onProxyRes: function(proxyRes, req, res){
      // If encrypted and headers['location'] exists (doesn't happen on some redirects)
      if (req.connection.encrypted && proxyRes.headers['location']){
        proxyRes.headers['location'] = proxyRes.headers['location'].replace(/^http:/g,'https:');
      }
    } // onProxyRes
  }
));

app.get('/uptime', function(req, res, next){
  exec("uptime", function(err,out,stderr) {
	if (!err) {
		res.send(out);
	} else {
		console.log(err,stderr);
		res.send(err,stderr);
	}
  })
});


// Make sure this is last as it will forward to APEX
app.get('/', function(req, res, next){
  // console.log('in / forward');
  // console.log('req.headers.origin:', req.headers);
  res.redirect(config.ords.path);
});


// app.listen(httpPort);
var server = http.createServer(app).listen(PORTS.HTTP);

var io = require('socket.io')(http).listen(server);

io.on('connection', function(socket){
  console.log('a user connected.');

  socket.on('disconnect', function(socket){
    console.log('a user disconnected ...');
  });

  socket.on('ping', function(msg){
    console.log('Got ping: ',msg);
    socket.emit('pong','Pong yourself!');
  });
});

if (config.web.https.enabled){
  https.createServer(
    {
      key: privateKey,
      cert: certificate
    },
    app).listen(PORTS.HTTPS);
}// config.web.https
