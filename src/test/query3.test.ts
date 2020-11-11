import * as fs from 'fs';
import t = require('tap');
//t.runOnly = true;

import {
    AuthorKeypair,
    DocToSet,
    Document,
    FormatName,
    IValidator,
    Path,
    WorkspaceAddress,
    isErr,
    notErr,
} from '../util/types';
import {
    generateAuthorKeypair,
    sha256base32,
} from '../crypto/crypto';
import { ValidatorEs4 } from '../validator/es4';
import {
    Query3,
    cleanUpQuery,
    documentIsExpired,
    historySortFn,
    queryMatchesDoc,
    validateQuery,
} from '../storage3/query3';

//================================================================================
// prepare for test scenarios

let WORKSPACE = '+gardenclub.xxxxxxxxxxxxxxxxxxxx';
let WORKSPACE2 = '+another.xxxxxxxxxxxxxxxxxxxx';

let VALIDATORS : IValidator[] = [ValidatorEs4];
let FORMAT : FormatName = VALIDATORS[0].format;

let keypair1 = generateAuthorKeypair('test') as AuthorKeypair;
let keypair2 = generateAuthorKeypair('twoo') as AuthorKeypair;
let keypair3 = generateAuthorKeypair('thre') as AuthorKeypair;
let keypair4 = generateAuthorKeypair('four') as AuthorKeypair;
if (isErr(keypair1)) { throw "oops"; }
if (isErr(keypair2)) { throw "oops"; }
if (isErr(keypair3)) { throw "oops"; }
if (isErr(keypair4)) { throw "oops"; }
let author1 = keypair1.address;
let author2 = keypair2.address;
let author3 = keypair3.address;
let author4 = keypair4.address;
let now = 1500000000000000;

let SEC = 1000000;
let MIN = SEC * 60;
let HOUR = MIN * 60;
let DAY = HOUR * 24;

let SNOWMAN = '☃';  // \u2603  [0xe2, 0x98, 0x83] -- 3 bytes

type MakeDocOpts = {
        workspace: WorkspaceAddress,
        keypair: AuthorKeypair,
        path: Path,
        content: string,
        timestamp: number,
        deleteAfter?: number,
}
let makeDoc = (opts: MakeDocOpts): Document => {
    let docToSet: DocToSet = {
        format: FORMAT,
        path: opts.path,
        content: opts.content,
    }
    let doc: Document = {
        format: docToSet.format,
        workspace: opts.workspace,
        path: docToSet.path,
        contentHash: sha256base32(docToSet.content),
        content: docToSet.content,
        author: opts.keypair.address,
        timestamp: opts.timestamp,
        deleteAfter: opts.deleteAfter || null,
        signature: '',
    }
    let validator = VALIDATORS[0];
    let signedDoc = validator.signDocument(opts.keypair, doc);
    if (isErr(signedDoc)) { throw signedDoc; }
    return signedDoc;
}

t.test('cleanUpQuery', (t: any) => {
    type TestCase = {
        query: Query3,
        result: Query3 | 'same',
        note?: string,
    }
    let testCases: TestCase[] = [
        {
            query: {},
            result: { history: 'latest' },
        },
        {
            query: { history: '???' } as any,
            result: { limit: 0 },
            note: 'invalid query turns to { limit: 0 }',
        }
    ];

    for (let { query, result, note } of testCases) {
        note = (note || '') + ' ' + JSON.stringify(query);
        let expected = result === 'same' ? query : result;
        t.same(cleanUpQuery(query), expected, note);
    }

    t.end();
});

t.test('validateQuery', (t: any) => {
    type TestCase = {
        query: Query3,
        valid: boolean,
        note?: string,
    }
    let testCases: TestCase[] = [
        { valid: true, query: {}, },

        { valid: true, query: { path: '/a' }, },
        { valid: true, query: { path: 'not-a-valid-path-but-still-ok-in-query' }, },

        { valid: true,  query: { limit: 1 }, },
        { valid: true,  query: { limit: 0 }, },
        { valid: false, query: { limit: -1 }, },

        { valid: true,  query: { limitBytes: 1 }, },
        { valid: true,  query: { limitBytes: 0 }, },
        { valid: false, query: { limitBytes: -1 }, },

        { valid: true,  query: { contentLength: 1 }, },
        { valid: true,  query: { contentLength: 0 }, },
        { valid: false, query: { contentLength: -1 }, },

        { valid: true,  query: { history: 'all' }, },
        { valid: true,  query: { history: 'latest' }, },
        { valid: false, query: { history: null } as any, },
        { valid: false, query: { history: '???' } as any, },
    ];

    for (let { query, valid, note } of testCases) {
        note = (note || '') + ' ' + JSON.stringify(query);
        let err = validateQuery(query);
        t.same(notErr(err), valid, note);
    }

    t.end();
});

t.test('documentIsExpired', (t: any) => {
    let base = { workspace: WORKSPACE };
    let inputDocs: Record<string, Document> = {
        dm1: makeDoc({...base, keypair: keypair1, timestamp: now-10, deleteAfter: now-1, path: '/a', content: ''}),
        d0:  makeDoc({...base, keypair: keypair1, timestamp: now-10, deleteAfter: now  , path: '/b', content: '1'}),
        dp1: makeDoc({...base, keypair: keypair1, timestamp: now-10, deleteAfter: now+1, path: '/c', content: '22'}),
        dx:  makeDoc({...base, keypair: keypair1, timestamp: now-10,                     path: '/c', content: '22'}),
    };

    t.same(documentIsExpired(inputDocs.dm1, now), true,  'now-1 should be expired');
    t.same(documentIsExpired(inputDocs.d0 , now), false, 'now   should not be expired');
    t.same(documentIsExpired(inputDocs.dp1, now), false, 'now+1 should not be expired');
    t.same(documentIsExpired(inputDocs.dx , now), false, 'permanent document should not be expired');

    t.end();
});

t.test('unicode characters vs bytes', (t: any) => {
    let base = { workspace: WORKSPACE };
    let docs: Document[] = [
        makeDoc({...base, keypair: keypair1, timestamp: now, path: '/0', content: ''}),
        makeDoc({...base, keypair: keypair1, timestamp: now, path: '/1', content: '1'}),
        makeDoc({...base, keypair: keypair1, timestamp: now, path: '/2', content: '22' }),
        makeDoc({...base, keypair: keypair1, timestamp: now, path: '/3', content: SNOWMAN}),  // 1 unicode character, 3 bytes
        makeDoc({...base, keypair: keypair2, timestamp: now, path: '/4', content: '4444'}),
    ];
    t.same(docs.filter(d => queryMatchesDoc({ contentLength: 0 }, d)).map(d => d.path), ['/0'], 'contentLength 0');
    t.same(docs.filter(d => queryMatchesDoc({ contentLength: 1 }, d)).map(d => d.path), ['/1'], 'contentLength 1 (no snowman)');
    t.same(docs.filter(d => queryMatchesDoc({ contentLength: 2 }, d)).map(d => d.path), ['/2'], 'contentLength 2');
    t.same(docs.filter(d => queryMatchesDoc({ contentLength: 3 }, d)).map(d => d.path), ['/3'], 'contentLength 3 (snowman)');
    t.same(docs.filter(d => queryMatchesDoc({ contentLength: 4 }, d)).map(d => d.path), ['/4'], 'contentLength 4');
    t.same(docs.filter(d => queryMatchesDoc({ contentLength: 77 }, d)).map(d => d.path), [], 'contentLength 77');

    t.end();
});

t.test('queryMatchesDoc', (t: any) => {
    let base = { workspace: WORKSPACE };
    let inputDocs: Record<string, Document> = {
        d0: makeDoc({...base, keypair: keypair1, timestamp: now    , path: '/a', content: ''}),
        d1: makeDoc({...base, keypair: keypair1, timestamp: now    , path: '/aa', content: '1'}),
        d2: makeDoc({...base, keypair: keypair1, timestamp: now    , path: '/aa/x', content: '22'}),
        d3: makeDoc({...base, keypair: keypair2, timestamp: now + 1, path: '/b', content: '333'}),
        d4: makeDoc({...base, keypair: keypair3, timestamp: now + 2, path: '/b', content: ''}),
        d5: makeDoc({...base, keypair: keypair1, timestamp: now    , path: '/cc/x', content: '55555'}),
    };

    let i = inputDocs;
    type TestCase = {
        query: Query3,
        matches: Document[],
        note?: string,
    }
    let testCases: TestCase[] = [
        // EVERYTHING
        {
            query: {},
            matches: [i.d0, i.d1, i.d2, i.d3, i.d4, i.d5],
        },
        // PATH
        {
            query: { path: '/aa' },
            matches: [i.d1],
        },
        {
            query: { path: '/b' },
            matches: [i.d3, i.d4],
            note: 'two authors at one path',
        },
        {
            query: { path: 'no such path' },
            matches: [],
        },
        // PATH PREFIX
        {
            query: { pathPrefix: '/aa' },
            matches: [i.d1, i.d2],
        },
        {
            query: { pathPrefix: 'no such prefix' },
            matches: [],
        },
        // TIMESTAMP
        {
            query: { timestamp: 0 },
            matches: [],
        },
        {
            query: { timestamp: 777 },
            matches: [],
        },
        {
            query: { timestamp: now + 1 },
            matches: [i.d3],
        },
        {
            query: { timestamp_gt: 777 },
            matches: [i.d0, i.d1, i.d2, i.d3, i.d4, i.d5],
        },
        {
            query: { timestamp_gt: 0 },
            matches: [i.d0, i.d1, i.d2, i.d3, i.d4, i.d5],
        },
        {
            query: { timestamp_gt: now },
            matches: [i.d3, i.d4],
        },
        {
            query: { timestamp_lt: 0 },
            matches: [],
        },
        {
            query: { timestamp_lt: 777 },
            matches: [],
        },
        {
            query: { timestamp_lt: now + 1 },
            matches: [i.d0, i.d1, i.d2, i.d5],
        },
        // AUTHOR
        {
            query: { author: author1 },
            matches: [i.d0, i.d1, i.d2, i.d5],
        },
        {
            query: { author: author4 },
            matches: [],
        },
        // CONTENT SIZE
        {
            query: { contentLength: 0 },
            matches: [i.d0, i.d4],
        },
        {
            query: { contentLength: 2 },
            matches: [i.d2],
        },
        {
            query: { contentLength_gt: 0 },
            matches: [i.d1, i.d2, i.d3, i.d5],
        },
        {
            query: { contentLength_lt: 2 },
            matches: [i.d0, i.d1, i.d4],
        },
    ];

    // test documentQuery
    for (let { query, matches, note } of testCases) {
        note = (note || '') + ' ' + JSON.stringify(query);
        let actualMatches = Object.values(inputDocs).filter(doc => queryMatchesDoc(query, doc));
        actualMatches.sort(historySortFn);
        matches.sort(historySortFn);
        if (matches.length !== actualMatches.length) {
            t.same(actualMatches.length, matches.length, `correct number of results: ${note}`);
        } else {
            t.same(actualMatches, matches, `all match: ${note}`);
        }
    }

    t.end();
});
