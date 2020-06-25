/**
 * Cipher layer, a intermediate layer between UDP and Websocket for
 * cryptography.
 * --------------------------------------------------------------------------
 *
 * This layer accepts a sharedsecret as basic parameter, which must be shared
 * between client and server.
 *
 * 1) AEAD Keys (AK)
 * These keys are derived from sharedsecret with time-slices every 30 seconds.
 * They are not synchronised via network.
 *
 * 2) socket_id
 * socket_id is a value issued for each UDP socket to be relayed. By itself
 * it's a buffer containing:
 *  a) a random public key of curve25519 algorithm
 *  b) the ID, which is a time slice, of server's ephemeral key, with which
 *     this socket intends to perform a key exchange
 *  
 * The server maintains a list of ephemeral keys, and generates a new key every
 * 300 seconds. These keys can be retrieved by `cipher.js`, this module when in
 * `client` mode. For each new socket request, a key exchange is performed,
 * and when successful, the server will use that key - that socket_id - to
 * send back response data. For key exchange failures, decryption will fail,
 * and this layer (cipher.js) will simply filter out such results.
 *
 *
 * Packets
 * -------
 * When encrypting a packet, aead_key_current is always used. When decrypting,
 * aead_key_current is tried first, and if failed, aead_key_past gives another
 * chance.
 *
 * Non-encrypted payload (plaintext) of a packet must be of one of the
 * following formats. Each format is treated as an array and will be serialized
 * via MessagePack.
 *
 * 1) Ephemeral Key Request
 *  which is a single byte: 0x00
 * 2) Ephemeral Key Response
 *  0x01, ephemeral_key_current, ephemeral_key_future_1, ephemeral_key_future_2...
 * 3) Data Transmission
 *  0x03, socket_id, addr, port, data
 */

const events = require("events");
const crypto = require("crypto");
const config = require("./config");

const timeslices = require("./cipher_timesliced");
const sharedsecret = config("websocket-sharedsecret");

const ECDHCURVE = "secp384r1";
const ALGORITHM = "AES-256-CCM";
const AUTHLENGTH = 16;
const NONCELENGTH = 12;

const EPHEMERAL_SERVER_KEY_LIFE = 3600 * 1000;   // ms
const EPHEMERAL_SERVER_KEY_PERIOD = 600 * 1000; // ms

// ---------------------------------------------------------------------------
// AEAD keys management

var aead_key_past, aead_key_current;
timeslices[30].on("changed", function({ past, current }){
    aead_key_past = crypto.pbkdf2Sync(sharedsecret, past, 1, 32, 'sha256');
    aead_key_current = crypto.pbkdf2Sync(
        sharedsecret, current, 1, 32, 'sha256');
});

// ---------------------------------------------------------------------------

function encrypt(plaintext){
    let salt = Buffer.from("00000000", "hex");
    if(!aead_key_current){
        console.warn("Warning: Attempt to encrypt without AEAD key. Dropped.");
        return null;
    }

    const nonce = crypto.randomBytes(NONCELENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, aead_key_current, nonce, {
        authTagLength: AUTHLENGTH
    });
    cipher.setAAD(salt, {
        plaintextLength: Buffer.byteLength(plaintext)
    });
    const ciphertext = cipher.update(plaintext);
    cipher.final();
    const tag = cipher.getAuthTag();

    return Buffer.concat([nonce, tag, ciphertext]);
}

function decrypt(ciphertext, salt){
    if(!aead_key_current){
        console.warn("Warning: Attempt to decrypt without AEAD key. Dropped.");
        return null;
    }
    if(!salt) salt = Buffer.from("00000000", "hex");
    if(Buffer.byteLength(ciphertext) < AUTHLENGTH+NONCELENGTH){
        return null;
    }
    const nonce = ciphertext.slice(0, NONCELENGTH);
    const tag = ciphertext.slice(NONCELENGTH, NONCELENGTH+AUTHLENGTH);
    ciphertext = ciphertext.slice(NONCELENGTH+AUTHLENGTH);

    function attempt(key){
        const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce, {
            authTagLength: AUTHLENGTH
        });
        decipher.setAuthTag(tag);
        decipher.setAAD(salt, {
            plaintextLength: ciphertext.length
        });
        const plaintext = decipher.update(ciphertext, null);
        try {
            decipher.final();
            return plaintext;
        } catch (err) {
            return null;
        } 
    }

    let ret = attempt(aead_key_current);
    if(null == ret) ret = attempt(aead_key_past);
    return ret;
}

// ---------------------------------------------------------------------------
// Ephemeral key generation and rotation
// Only activated when config("role") == "server"

var ephemeral_server_keys = new Map();
if(config("role") == "server"){
    setInterval(rotate_ephemeral_server_keys, EPHEMERAL_SERVER_KEY_PERIOD);
    rotate_ephemeral_server_keys();
}
function rotate_ephemeral_server_keys(){
    const now = new Date().getTime();
    const deadline = now - EPHEMERAL_SERVER_KEY_LIFE;
    const Nmax = Math.ceil(
        EPHEMERAL_SERVER_KEY_LIFE / EPHEMERAL_SERVER_KEY_PERIOD) * 2;

    // remove expired keys
    for(let [creation, _] of ephemeral_server_keys){
        if(creation < deadline) ephemeral_server_keys.delete(creation);
    }

    // if too many keys generated: stop generation
    if(ephemeral_server_keys.size > Nmax) return;

    // otherwise, generate a new key
    const new_key = crypto.createECDH(ECDHCURVE);
    const new_public_key = new_key.generateKeys();

    ephemeral_server_keys.set(now, {
        public_key: new_public_key,
        compute_secret: new_key.computeSecret,
    });
}

function dump_ephemeral_server_keys(){
    const now = new Date().getTime();
    const deadline = now - EPHEMERAL_SERVER_KEY_LIFE;
    const ret = [];
    for(let [creation, {public_key, compute_secret}] of ephemeral_server_keys){
        if(creation < deadline) continue;
        ret.push([creation, public_key]);
    }
    return ret;
}


// ---------------------------------------------------------------------------
// cipher layer interface

class CipherLayer extends events.EventEmitter {

    constructor(){
        super();
        this.ecdh = crypto.createECDH(ECDHCURVE);
    }

    allocate_client_socket_id(){
        
    }

    before_outgoing({socket_id, port, addr, data}){
    }

    before_incoming(packet){
    }


}


module.exports = new CipherLayer();
