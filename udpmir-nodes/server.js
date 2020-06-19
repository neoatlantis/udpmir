#!/usr/bin/env node

// TODO must be changed!
const shared_secret = Buffer.from("deadbeefdeadbeefdeadbeefdeadbeef");

const util = require("./util");
const cipher = require("./cipher");
const websocket_access_control = require("./websocket_access");
const setup_websocket_lifecycle = require("./websocket_lifecycle");
const {pack, unpack} = require("./websocket_payload");

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
        delete websockets[id];
    });

    websocket.on("message", (m) => on_websocket_message(m));
    
    setup_websocket_lifecycle(websocket);
}


async function on_websocket_message(message){
    let plaintext = cipher.decrypt(shared_secret, message);
    if(!plaintext) return;
    try{
        plaintext = unpack(plaintext);
    } catch(e){ 
        return;
    }

    let { data, id, id_buf, addr, port } = plaintext;

    if(undefined == udpsockets[id]){
        // create a new UDP socket for proxy purpose

        const udpsocket = require("dgram").createSocket("udp4"); 
        udpsocket.last_active = new Date().getTime();

        await new Promise((resolve, reject) => udpsocket.bind(resolve));
        udpsockets[id] = udpsocket;
        udpsocket.id_buf = id_buf;
        udpsocket.id = id;

        udpsocket.on("message", (msg, rinfo) => 
            on_udpsocket_message(id, msg, rinfo));
    }

    udpsockets[id].send(data, 0, data.length, port, addr);
    console.log("UDP to remote @ " + addr + ":" + port + " : " + data.length + " bytes written.");
}




async function on_udpsocket_message(id, msg, rinfo){
    const udpsocket = udpsockets[id];
    const websocket = util.random_pick_from_obj(websockets);

    udpsocket.last_active = new Date().getTime();

    const plaintext = {
        data: msg,
        id: udpsocket.id_buf, 
        addr: rinfo.address,
        port: rinfo.port,
    };
    
    console.log("Remote to UDP: " + msg.length + " bytes read.");
    websocket.send(cipher.encrypt(shared_secret, pack(plaintext)));
}



function remove_inactive_udp_sockets(){
    const now = new Date().getTime();
    const removing = [];
    for(let socketid in udpsockets){
        if(now - udpsockets[socketid].last_active > 30000){
            removing.push(socketid);
        }
    }
    for(let socketid of removing){
        console.log("Remove socket ", socketid);
        const socket = udpsockets[socketid];
        socket.close();
        socket.removeAllListeners();
        delete udpsockets[socketid];
    }
}
setInterval(remove_inactive_udp_sockets, 10000);
