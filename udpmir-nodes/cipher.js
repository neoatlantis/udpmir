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
const crc32 = require("crc-32");
const config = require("./config");

const {pack, unpack} = require("./websocket_payload");
const timeslices = require("./timeslices");
const sharedsecret = config("websocket-sharedsecret");
const SocketID = require("./socketid");

const ECDHCURVE = "secp384r1";
const ALGORITHM = "AES-256-CCM";
const STREAM_ALGORITHM = "CAMELLIA-256-CTR";
const STREAM_IV_LENGTH = 16;
const AUTHLENGTH = 16;
const NONCELENGTH = 12;

const IS_SERVER = (config("role") === "server");

// ---------------------------------------------------------------------------
// AEAD keys management

var aead_key_past, aead_key_current;
timeslices[30].on("changed", function({ past, current }){
    aead_key_past = crypto.pbkdf2Sync(sharedsecret, past, 1, 32, 'sha256');
    aead_key_current = crypto.pbkdf2Sync(
        sharedsecret, current, 1, 32, 'sha256');
});

// ---------------------------------------------------------------------------

const crc32_checksum = new Int32Array(1);
const crc32_u8array = new Uint8Array(crc32_checksum.buffer);

function stream_encrypt(key, plaintext){
    crc32_checksum[0] = crc32.buf(plaintext);
    const data = Buffer.concat([crc32_u8array, plaintext]);
    const iv = crypto.randomBytes(STREAM_IV_LENGTH);
    const cipher = crypto.createCipheriv(STREAM_ALGORITHM, key, iv);
    const ciphertext = cipher.update(data);
    cipher.final();
    return Buffer.concat([iv, ciphertext]);
}

function stream_decrypt(key, ciphertext){
    const iv = ciphertext.slice(0, STREAM_IV_LENGTH);
    const data = ciphertext.slice(STREAM_IV_LENGTH);
    const decipher = crypto.createDecipheriv(STREAM_ALGORITHM, key, iv);
    const decrypted = decipher.update(data);
    decipher.final();

    const checksum = decrypted.slice(0, 4);
    const plaintext = decrypted.slice(4);
    crc32_checksum[0] = crc32.buf(plaintext);
    if(Buffer.from(crc32_u8array).equals(checksum)){
        return plaintext;
    }
    return null;
}

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
function rotate_ephemeral_server_keys({past, current}){
    // remove expired keys
    for(let [creation, _] of ephemeral_server_keys){
        if(creation < past.value) ephemeral_server_keys.delete(creation);
    }

    // otherwise, generate a new key
    const new_key = crypto.createECDH(ECDHCURVE);
    const new_public_key = new_key.generateKeys();

    ephemeral_server_keys.set(current.value, {
        public_key: new_public_key,
        pair: new_key.computeSecret,
    });
}

function dump_ephemeral_server_keys(){
    const ret = [];
    for(let [creation, {public_key, compute_secret}] of ephemeral_server_keys){
        if(creation < timeslices[300].past.value) continue;
        ret.push([new timeslices.Timeslice(creation).buffer, public_key]);
    }
    return ret;
}

if(IS_SERVER){
    timeslices[300].on("changed", rotate_ephemeral_server_keys);
} else {
    // pulls server public keys peridically
}

// ---------------------------------------------------------------------------
// cipher layer interface

class CipherLayer extends events.EventEmitter {

    constructor(){
        super();
    }

    allocate_client_socket_id(udpsocket){
        // Intended to be called when running in client mode. Allocates a local
        // ECDH key to client.
        if(IS_SERVER) throw Error("Refuse to allocate socket id in server mode.");
        udpsocket.id = SocketID.generate();
    }

    before_outgoing(udpsocket, {port, addr, data}){ // from UDP
        const packet_plain = pack({
            id: udpsocket.id.buffer,
            addr: addr, 
            port: port,
            data: data,
        });

        let p = encrypt(packet_plain);
        this.emit("websocket_send", p);
        //if(null != p) ws.send(p);
    }

    before_incoming(message){ // from WebSocket
        let plaintext = decrypt(message);
        if(!plaintext) return;
        try{
            plaintext = unpack(plaintext);
        } catch(e){ 
            return;
        }

        const { data, id_buf, addr, port } = plaintext;
        const id = SocketID.from_buffer(id_buf);
        this.emit("udp_receive", {data, id, addr, port});

    }


}


module.exports = new CipherLayer();
