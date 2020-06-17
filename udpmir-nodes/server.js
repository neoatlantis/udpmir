#!/usr/bin/env node

// TODO must be changed!
const shared_secret = Buffer.from("deadbeefdeadbeefdeadbeefdeadbeef");

const util = require("./util");
const cipher = require("./cipher");
const websocket_access_control = require("./websocket_access");

const websockets = {};
const udpsockets = {};

const ws = require("ws");
const wsserver = new ws.Server({ port: 6489 });
wsserver.on('connection', on_websocket);


let websocket_i = 0;

async function on_websocket(websocket){
    try{
        await websocket_access_control(websocket);
    }catch(e){
        return;
    }

    websocket_i += 1;
    const id = websocket_i;

    websockets[id] = websocket;
    console.log("Remote connection accepted.");
    
    websocket.on("close", function(){
        websocket.removeAllListeners();
        delete websockets[id];
    });

    websocket.on("message", (m) => on_websocket_message(m));
}


async function on_websocket_message(message){
    let plaintext = cipher.decrypt(shared_secret, message);
    if(!plaintext) return;
    try{
        plaintext = JSON.parse(plaintext.toString("utf-8"));
    } catch(e){ 
        return;
    }

    let { data, socket, dstaddr, dstport } = plaintext;
    try{
        data = Buffer.from(data, "base64");
    } catch(e){
        return;
    }

    if(undefined == udpsockets[socket]){
        const udpsocket = require("dgram").createSocket("udp4"); 
        await new Promise((resolve, reject) => udpsocket.bind(resolve));
        udpsockets[socket] = udpsocket;

        udpsocket.on("message", (msg, rinfo) => 
            on_udpsocket_message(socket, msg, rinfo));
    }

    udpsockets[socket].send(data, 0, data.length, dstport, dstaddr);
    console.log("UDP to remote @ " + dstaddr + ":" + dstport + " : " + data.length + " bytes written.");
}




async function on_udpsocket_message(id, msg, rinfo){
    const udpsocket = udpsockets[id];
    const websocket = util.random_pick_from_obj(websockets);

    const plaintext = {
        data: msg.toString("base64"),
        socket: id,
        srcaddr: rinfo.address,
        srcport: rinfo.port,
    };
    
    console.log("Remote to UDP: " + msg.length + " bytes read.");
    websocket.send(cipher.encrypt(shared_secret, JSON.stringify(plaintext)));
}
