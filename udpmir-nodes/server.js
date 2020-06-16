#!/usr/bin/env node

// TODO must be changed!
const shared_secret = Buffer.from("deadbeefdeadbeefdeadbeefdeadbeef");


const cipher = require("./cipher");

const ws = require("ws");
const wsserver = new ws.Server({ port: 6489 });
wsserver.on('connection', on_websocket);


let websocket_i = 0;
const websockets = {};

function on_websocket(websocket){
    websocket_i += 1;
    const id = websocket_i;

    websockets[id] = websocket;
    console.log("Remote connection accepted.");
    
    websocket.on("close", function(){
        websocket.removeAllListeners();
        delete websockets[id];
    });

    websocket.on("message", (m) => {
        let plaintext = cipher.decrypt(shared_secret, m);
        if(!plaintext) return;
        try{
            plaintext = JSON.parse(plaintext.toString("utf-8"));
        } catch(e){ 
            return;
        }
        console.log(plaintext);
    });
}
