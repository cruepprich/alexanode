var Client = require('node-rest-client').Client;
 
var client = new Client();
 
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// direct way 
client.get("https://ruepprich.com/ords/obe/hr/employees/7369", function (data, response) {
    // parsed response body as js object 
    console.log(data);
    // raw response 
    //console.log(response);
});
 
/*/ registering remote methods 
client.registerMethod("jsonMethod", "https://ruepprich.com/ords/obe/hr/employees/7369", "GET");
 
client.methods.jsonMethod(function (data, response) {
    // parsed response body as js object 
    console.log(data);
    // raw response 
    //console.log(response);
});
*/
