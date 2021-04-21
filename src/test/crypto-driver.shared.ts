import t = require('tap');
//t.runOnly = true;

//import tape = require('tape');
//let t = { test: tape };

import {
    identifyBufOrBytes,
    isBuffer,
    isBytes,
    stringToBuffer,
    stringToBytes
} from '../util/bytes';
import {
    base32StringToBytes
} from '../base32';
import {
    ICryptoDriver
} from '../types/crypto-types';

//================================================================================

// use this unicode character for testing
let snowmanString = '\u2603';  // ☃ \u2603  [0xe2, 0x98, 0x83] -- 3 bytes
let snowmanBytes = Uint8Array.from([0xe2, 0x98, 0x83]);

//================================================================================

export let runCryptoDriverTests = (driver: ICryptoDriver) => {

    t.test('sha256(bytes | string) --> bytes', (t: any) => {
        let vectors : [Uint8Array | string | Buffer, Uint8Array][] = [
            // input, output
            ['', base32StringToBytes('b4oymiquy7qobjgx36tejs35zeqt24qpemsnzgtfeswmrw6csxbkq')],
            [stringToBytes(''), base32StringToBytes('b4oymiquy7qobjgx36tejs35zeqt24qpemsnzgtfeswmrw6csxbkq')],
            ['abc', base32StringToBytes('bxj4bnp4pahh6uqkbidpf3lrceoyagyndsylxvhfucd7wd4qacwwq')],
            [stringToBytes('abc'), base32StringToBytes('bxj4bnp4pahh6uqkbidpf3lrceoyagyndsylxvhfucd7wd4qacwwq')],
            [snowmanString, base32StringToBytes('bkfsdgyoht3fo6jni32ac3yspk4f2exm4fxy5elmu7lpbdnhum3ga')],
            [snowmanBytes, base32StringToBytes('bkfsdgyoht3fo6jni32ac3yspk4f2exm4fxy5elmu7lpbdnhum3ga')],

            // we're not supposed to feed it Buffers but let's find out what happens when we do.
            [stringToBuffer('abc'), base32StringToBytes('bxj4bnp4pahh6uqkbidpf3lrceoyagyndsylxvhfucd7wd4qacwwq')],
            [stringToBuffer(''), base32StringToBytes('b4oymiquy7qobjgx36tejs35zeqt24qpemsnzgtfeswmrw6csxbkq')],
            [stringToBuffer(snowmanString), base32StringToBytes('bkfsdgyoht3fo6jni32ac3yspk4f2exm4fxy5elmu7lpbdnhum3ga')],
        ];
        for (let [input, expectedResult] of vectors) {
            let actualResult = driver.sha256(input);
            t.same(identifyBufOrBytes(actualResult), 'bytes', 'sha256 outputs bytes');
            t.same(actualResult.length, 32, 'sha256 outputs 32 bytes');
            t.same(actualResult, expectedResult, `hash of bytes or string: ${JSON.stringify(input)}`)
        }
        t.end();
    });

    t.test('generateKeypairBytes', (t: any) => {
        let keypair = driver.generateKeypairBytes();
        t.same(identifyBufOrBytes(keypair.pubkey), 'bytes', 'keypair.pubkey is bytes');
        t.same(identifyBufOrBytes(keypair.secret), 'bytes', 'keypair.secret is bytes');
        t.same(keypair.pubkey.length, 32, 'pubkey is 32 bytes long');
        t.same(keypair.secret.length, 32, 'secret is 32 bytes long');

        let keypair2 = driver.generateKeypairBytes();
        t.notSame(keypair.pubkey, keypair2.pubkey, 'generateKeypairBytes is non-deterministic (pubkey)');
        t.notSame(keypair.secret, keypair2.secret, 'generateKeypairBytes is non-deterministic (secret)');

        t.end();
    });

    t.test('sign and verify', (t: any) => {
        t.ok(true, 'TODO');

        let keypairBytes = driver.generateKeypairBytes();
        let msg = 'hello'
        let sigBytes = driver.sign(keypairBytes, msg);

        t.same(identifyBufOrBytes(sigBytes), 'bytes', 'signature is bytes');
        t.same(sigBytes.length, 64, 'sig is 64 bytes long');

        t.end();
    });

}
