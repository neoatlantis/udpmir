/**
 * Websockets connection handling cluster.
 *
 * A set of websockets connections are accepted, and used for incoming and
 * outgoing packet exchange.
 *
 */

const events = require("events");
const ws = require("ws");
const config = require("./config");
const util = require("./util");
const cipher = require("./cipher");

var websockets_i = 0;
const websockets = {};

const websocket_access_control = require("./websocket_access");

const wsserver = new ws.Server({ port: config("websocket-port") });
wsserver.on("connection", on_websocket);





async function on_websocket(websocket){
    try{
        await websocket_access_control(websocket);
    }catch(e){
        return;
    }

    websockets_i += 1;
    const id = websockets_i;
    websockets[id] = websocket;
    
    websocket.on("close", function(){
        delete websockets[id];
        setTimeout(() => websocket.removeAllListeners(), 10);
    });

    websocket.on("message", (m) => on_data_received(m));

    websocket_set_keepalive(websocket);
}



/**
 * Accepts a WebSocket instance, set mechanism to keep it alive (using ping)
 * and terminate it after timeout.
 */
function websocket_set_keepalive(ws){
    function on_pong(){
        ws._life = 30000;
    }

    var ping_handle = null;
    function ping(){
        ws.ping(function(){});
        if(ws._life !== undefined) ws._life -= 10000;
        if(ws._life < 0){
            ws.terminate();
            if(null !== ping_handle) clearTimeout(ping_handle);
        } else {
            ping_handle = setTimeout(ping, 10000);
        }
    }
    
    on_pong(); ping();
    ws.on("pong", on_pong);
}

/**
 * Websockets are operated by `cipher` layer.
 */

cipher.on("websocket_send", async function on_sending_request(message){
    const ws = util.random_pick_from_obj(websockets);
    if(null == ws) return console.log("One outgoing packet dropped.");
    ws.send(message);
});

async function on_data_received(message){
    cipher.before_incoming(message);
}
