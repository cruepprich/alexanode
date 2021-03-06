var path           = require('path');
var fs             = require('fs');
var express        = require('express');
//var favicon       = require('serve-favicon');
var http           = require('http');
var https          = require('https');
var forceSSL       = require('express-force-ssl');
var app            = express();
var proxy          = require('http-proxy-middleware');
//https://github.com/expressjs/morgan
//var morgan = require('morgan');

var config         = require('./config');
var privateKey, certificate;
var exec           = require('child_process').exec;

var bodyParser     = require("body-parser");
var RESTPATH       = '/rest';
var alexa          = require('alexa-app');
var alexaVerifier  = require('alexa-verifier');
var respMessage;

var RESTClient = require('node-rest-client').Client;
var restClient = new RESTClient();

//allow self signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Default Ports
var PORTS = {
  HTTP: config.web.http.port || 80,
  HTTPS: config.web.https.port || 443,
  FORCE_SSL_PORT: ''
}

// create a write stream (in append mode)
var accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), {flags: 'a'})

// setup the logger
//app.use(morgan('combined', {stream: accessLogStream}))


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


//Setup REST
var alexaVerifier = require('alexa-verifier'); // at the top of our file

function requestVerifier(req, res, next) {
    alexaVerifier(
        req.headers.signaturecertchainurl,
        req.headers.signature,
        req.rawBody,
        function cb(err) {
                console.log('from requestVerifier: ',err);
                next();
        }
        // function verificationCallback(err) {
        //     if (err) {
        //         res.status(401).json({ message: 'Verification Failure', error: err });
        //     } else {
        //         next();
        //     }
        // }
    );
}

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());



// Make sure this is last as it will forward to APEX
app.get('/', function(req, res, next){
  // console.log('in / forward');
  // console.log('req.headers.origin:', req.headers);
  res.redirect(config.ords.path);
});



//Start server
var server = http.createServer(app).listen(PORTS.HTTP,function(){
  console.log('Server Ready');
  console.log('On error check that Apache is not already running.');
  console.log('APEX runs on Jackie. Workspace hr,cruepprich, G_22, app 102');
  console.log('Test the skill with:');
  console.log('Alexa, ask apex to get employee onehundred');
});

var io = require('socket.io')(http).listen(server);

//now that we have io, we can attach a route that uses socket
//see http://bit.ly/2f83ql9
app.set('socketIo',io);

//Test with Postman post ruepprich.com/test
app.route('/test').post(function(req,res){
  var soc = req.app.get('socketIo');
  soc.emit('pong','yowsa!');
  res.send('test route');
  res.end();
})

app.route(RESTPATH+'/alexaTest').post( function(req, res) {

  var soc = req.app.get('socketIo');
  console.log('Type',req.body.request.type,req.body.request.intent.name);

  if (req.body.request.type === 'LaunchRequest') { /* ... */ }
  else if (req.body.request.type === 'SessionEndedRequest') { /* ... */ }
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'NumberOfOrdersForCustomer') {

                if (!req.body.request.intent.slots.firstName ||
                    !req.body.request.intent.slots.firstName.value) {
                  // Handle this error by producing a response like:
                  // "Hmm, what firstName do you want to know the forecast for?"
                }
                var firstName = req.body.request.intent.slots.firstName.value;
                var lastName = req.body.request.intent.slots.lastName.value;
                var slots = Object.keys(req.body.request.intent.slots).length;

                soc.emit('pong',firstName+" "+lastName);

                console.log('firstName',firstName);
                console.log('lastName',lastName);
                console.log('slots',slots);
                respMessage = 'Hello '+firstName+" "+lastName;
                // Do your business logic to get weather data here!
                // Then send a JSON response...

                res.json({
                  "version": "1.0",
                  "response": {
                    "shouldEndSession": true,
                    "outputSpeech": {
                      "type": "SSML",
                      "ssml": "<speak>"+respMessage+"</speak>"
                    }
                  }
                });

                res.end('done');
              }
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'GetEmployeeID') {
                  if (!req.body.request.intent.slots.empid ||
                    !req.body.request.intent.slots.empid.value) {
                    // Handle this error by producing a response like:
                    // "Hmm, what firstName do you want to know the forecast for?"
                  }
                  var empid = req.body.request.intent.slots.empid.value;
                  var cardMsg,speechMsg;
                  console.log('req empid value ['+empid+']');
                  var restURL = "https://ruepprich.com/ords/hr/alexa/employees/"+empid;
                  console.log('restURL',restURL);
                  //Fetch result via REST
                  restClient.get(restURL, function (data, response) {
                      
                      // parse response body as js object
                      if (typeof data.items[0] != 'undefined') {
                        var emp = data.items[0];
                        var name = emp.first_name+' '+emp.last_name;
                        cardMsg = 'Name: '+name;
                        speechMsg = 'The name of employee '+empid+' is '+name;
                        console.log('cardMsg',cardMsg);
                      } else {
                        cardMsg = 'There is no employee with that ID. ['+empid+']';
                        speechMsg = cardMsg;
                      }

                      soc.emit('card',cardMsg);
                      soc.emit('empid',empid);

                      res.json({
                                "version": "1.0",
                                "response": {
                                  "outputSpeech": {
                                      "type":"SSML"
                                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                                  },
                                  "card": {
                                    "type": "Simple",
                                    "title": "APEX Employee "+empid,
                                    "content": "Query result:\n"+cardMsg
                                  }
                                }
                      });
                      res.end('done');

                  });


            }
else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'GetEmployeesInDept') {
                  if (!req.body.request.intent.slots.empid ||
                    !req.body.request.intent.slots.empid.value) {
                    // Handle this error by producing a response like:
                    // "Hmm, what firstName do you want to know the forecast for?"
                  }
                  var department_id = req.body.request.intent.slots.department_id.value;
                  var cardMsg,speechMsg;
                  console.log('req department_id value ['+department_id+']');
                  var restURL = "https://ruepprich.com/ords/hr/alexa/department_emps/"+department_id;
                  console.log('restURL',restURL);
                  //Fetch result via REST
                  restClient.get(restURL, function (data, response) {
                  speechMsg = 'Getting employees for department '+department_id;

                      // parse response body as js object
                      if (typeof data.items[0] != 'undefined') {
                        var totalemps = data.items.length;
                        cardMsg = 'Department '+department_id+' has '+totalemps+' Employees';
                        speechMsg = cardMsg;
                        console.log('cardMsg',cardMsg);
                      } else {
                        cardMsg = 'There is no department with that ID. ['+empid+']';
                        speechMsg = cardMsg;
                      }

                      soc.emit('department_id',department_id);

                      res.json({
                                "version": "1.0",
                                "response": {
                                  "outputSpeech": {
                                      "type":"SSML"
                                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                                  },
                                  "card": {
                                    "type": "Simple",
                                    "title": "APEX Employees In Department "+department_id,
                                    "content": "Query result:\n"+cardMsg
                                  }
                                }
                      });
                      res.end('done');

                  });


            }
});

app.route(RESTPATH+'/getTest').get( function(req, res) {

  console.log('getTest',req);
  res.end('done');
});

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
