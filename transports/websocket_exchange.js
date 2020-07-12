import { sha256 } from "./sha256.js";


const local_sockets = {};
const remote_sockets = {};
const callbacks = [];


function random_pick_from_obj(obj){
    const keys = Object.keys(obj);
    if(keys.length < 1) return null;
    const key = keys[Math.floor(Math.random() * keys.length)];
    return obj[key];
}



async function on_message(e, target_group){
    const buffer = await e.data.arrayBuffer();
    const target = random_pick_from_obj(target_group);
    if(!target) return 0;
    target.ws.send(buffer);
    target.sent += buffer.byteLength;
    return buffer.byteLength;
}


async function websocket_token(websocket, key){
    const token = new Uint8Array(52);

    const t = Math.floor(new Date().getTime() / 30000);
    const nonce = new Uint8Array(20);
    window.crypto.getRandomValues(nonce);
    const timeslice = new Uint8Array(new Uint32Array([t]).buffer);
    nonce.set(timeslice, 0);
    token.set(nonce, 0);

    const hmac = sha256.hmac.create(key);
    hmac.update(nonce);
    const signature = new Uint8Array(hmac.arrayBuffer());
    token.set(signature, 20);

    websocket.send(token);
}


function parse_ws_url(url){
    console.log(url);
    const parts = /^(ws{1,2}\:\/\/)([^@]+)@([^\/]+)/.exec(url);
    if(!parts) throw Error("Invalid Websocket URL.");

    const [ prefix, password, host ] = parts.slice(1);
    const ws_url = prefix + host;
    const norm_url = prefix + password + "@" + host;
    return { ws_url, password, norm_url };
}



function set_up_websocket(url, group){
    const { ws_url, norm_url, password } = parse_ws_url(url);
    const ws = new ReconnectingWebSocket(ws_url);

    const target_group = ("remote" == group ? local_sockets : remote_sockets);
    const ws_group = ("local" == group ? local_sockets : remote_sockets);

    ws.onmessage = async function(e){
        const datalen = await on_message(e, target_group);
        ws_group[norm_url].recv += datalen;
        ws_group[norm_url].status = "connected";
    };

    ws_group[norm_url] = { ws: ws, sent: 0, recv: 0, status: "closed" };

    ws.onopen = () => {
        ws_group[norm_url].status = "authenticating";
        setTimeout(()=>websocket_token(
            ws,
            new TextEncoder().encode(password)
        ), 100);
        console.log(group + " ws open");
    };
    ws.onclose = () => {
        ws_group[norm_url].status = "closed";
        console.log("ws closed. reconnect.");
    };
}


export function on_websocket_info(callback){ callbacks.push(callback); };
export function add_remote(url){ return set_up_websocket(url, "remote") };
export function add_local(url){ return set_up_websocket(url, "local") };

setInterval(function(){
    let info = {
        local: {},
        remote: {},
    };
    for(let id in local_sockets){
        info.local[id] = {
            sent: local_sockets[id].sent, 
            recv: local_sockets[id].recv,
            status: local_sockets[id].status,
        };
    }
    for(let id in remote_sockets){
        info.remote[id] = {
            sent: remote_sockets[id].sent, 
            recv: remote_sockets[id].recv,
            status: remote_sockets[id].status,
        };
    }

    callbacks.forEach((callback) => callback(info));
}, 1000);
