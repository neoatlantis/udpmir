/**
 * Time-slice based access control
 *
 * Access to websockets are restricted via a token being submitted at begin
 * of each connection.
 *
 * A token is a 52-bytes data, the first 20 bytes being a nonce, the latter
 * 32 bytes being a HMAC calculated on the nonce using shared_secret.
 *
 * Furthermore, the first 4 bytes in a nonce must be equal to the current
 * time slice, which is defined as UNIX timestamp divided by 30 seconds.
 * A tolerance is given +/- 30 seconds for server/client time mismatches.
 */
const config = require("./config");
const crypto = require("crypto");
const shared_secret = config("websocket-access-key");


let past_timeslice, current_timeslice, future_timeslice, current_time;

function update_timeslice(){
    const t = Math.floor(new Date().getTime() / 30000);
    past_timeslice =  Buffer.from(new Uint32Array([t-1]).buffer);
    current_timeslice = Buffer.from(new Uint32Array([t]).buffer);
    future_timeslice = Buffer.from(new Uint32Array([t+1]).buffer);
    current_time = t;
}
update_timeslice();
setInterval(update_timeslice, 10000);


// Nonce have 20 bytes: first 4 bytes equal to current time slice, last 16
// bytes random.

const spent_nonces = {};

function check_nonce(s){
    if(!Buffer.isBuffer(s)) throw Error("Check nonce input: must be buffer");
    if(s.length != 20) return false;

    const nonce_hex = s.toString("hex");
    if(spent_nonces[nonce_hex] !== undefined) return false;

    const first4 = s.slice(0, 4);
    if(!(
        first4.equals(past_timeslice) ||
        first4.equals(current_timeslice) ||
        first4.equals(future_timeslice)
    )){
        return false;
    }
    spent_nonces[nonce_hex] = current_time;
    return true;
}

function free_nonces(){
    const del = [];
    for(let nonce in spent_nonces){
        if(
            current_time - spent_nonces[nonce] > 4 || // 4 * 30000 ms
            current_time - spent_nonces[nonce] < 0 // not likely, for safety
        ){
            del.push(nonce);
        }
    }
    for(let nonce of del){
        delete spent_nonces[nonce];
    }
}

setInterval(free_nonces, 60000);


// Verify a token

function verify_token(s){
    if(!Buffer.isBuffer(s)) return false;
    if(52 != s.length) return false;
    const nonce = s.slice(0, 20);
    const signature = s.slice(20);
    if(!check_nonce(nonce)) return false;
    // check signature
    const hmac = crypto.createHmac('sha256', shared_secret);
    hmac.update(nonce);
    const required_hmac = hmac.digest();

    return required_hmac.equals(signature);
}







function receive_once(websocket){
    return new Promise((resolve, reject) => {
        websocket.once("message", (data) => {
            resolve(data);
        });
    });
}

function timeout_rejection(duration){
    return new Promise((resolve, reject) => {
        setTimeout(reject, duration);
    });
}


module.exports = async function(websocket){
    console.log("Websocket waiting for client auth.");

    function kill(e){
        websocket.close();
        throw Error(e);
    }

    try{
        var client_hello = await Promise.race([
            receive_once(websocket),
            timeout_rejection(10000),
        ]);
    } catch(e){
        console.log(e);
        kill("Timed out");
    }

    if(!verify_token(client_hello)) kill("Token invalid.");
    console.log("Websocket connection success.");
}
