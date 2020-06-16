const crypto = require("crypto");

const ALGORITHM = "AES-256-CCM";
const AUTHLENGTH = 16;
const NONCELENGTH = 12;


function encrypt(key, plaintext, salt){
    if(!salt) salt = Buffer.from("000000000", "hex");

    const nonce = crypto.randomBytes(NONCELENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, nonce, {
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

function decrypt(key, ciphertext, salt){
    if(!salt) salt = Buffer.from("000000000", "hex");
    if(Buffer.byteLength(ciphertext) < AUTHLENGTH+NONCELENGTH){
        return null;
    }
    const nonce = ciphertext.slice(0, NONCELENGTH);
    const tag = ciphertext.slice(NONCELENGTH, NONCELENGTH+AUTHLENGTH);
    ciphertext = ciphertext.slice(NONCELENGTH+AUTHLENGTH);

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


module.exports.decrypt = decrypt;
module.exports.encrypt = encrypt;
