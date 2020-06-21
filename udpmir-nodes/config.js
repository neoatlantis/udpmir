/*

websocket-access-key
websocket-sharedsecret
websocket-port

*/


let entries = {};


module.exports = function get(key){
    if(entries[key] === undefined){
        throw Error("Unknown config entry: " + key);
    }
    return entries[key];
}

module.exports.init = function(config){
    entries = config;
}
